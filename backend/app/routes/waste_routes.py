import base64
import io
import os
import logging

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.analytics_store import get_analytics, get_analytics_compact, get_learning_snapshot, record_analysis
from app.core.decision_engine import analyser_dechet, explain_ml_adjustments
from app.core.environmental_factors_db import (
    get_environmental_factors_db,
    get_environmental_factors_template,
    update_environmental_factors_db,
)
from app.core.image_identifier import identify_waste_from_image
from app.core.literature_db import get_literature_db, get_scientific_prefill
from app.core.regulation_db import get_regulation_db
from app.core.reporting import build_analytics_pdf, send_analytics_report_email
from app.models.waste import (
    DecisionResult,
    WasteImageIdentificationInput,
    WasteImageIdentificationResult,
    WasteInput,
)

router = APIRouter(prefix="/api/waste", tags=["waste"])
logger = logging.getLogger(__name__)


class ReportEmailRequest(BaseModel):
    email: str
    subject: str | None = None
    message: str | None = None


class EnvironmentalFactorsUpdateRequest(BaseModel):
    version: str
    scope: str
    default: dict[str, object]
    countries: dict[str, dict[str, object]]
    references: list[str]


def _check_admin_access(x_admin_key: str | None):
    required = os.getenv("WASTEAI_ADMIN_KEY") or os.getenv("WASTEWISE_ADMIN_KEY")
    if not required:
        return
    if x_admin_key != required:
        raise HTTPException(status_code=403, detail="Acces refuse: cle admin invalide.")


@router.post("/analyze", response_model=DecisionResult)
def analyze_waste(waste: WasteInput):
    result = analyser_dechet(waste)
    record_analysis(waste, result)
    return result


@router.get("/analytics")
def get_dashboard_analytics(limit: int = Query(default=100, ge=1, le=1000)):
    try:
        return get_analytics(limit=limit)
    except Exception:
        logger.exception("Analytics endpoint failed")
        return {
            "summary": {
                "total_analyses": 0,
                "tonnes_valorisees": 0.0,
                "revenus_generes_eur": 0.0,
                "co2_evite_kg": 0.0,
            },
            "history": [],
            "meta": {"fallback": True, "reason": "analytics_store_unavailable"},
        }


@router.get("/analytics/learning")
def get_learning_insights(limit: int = Query(default=500, ge=10, le=2000)):
    return get_learning_snapshot(limit=limit)


@router.get("/analytics/report/pdf")
def download_analytics_report_pdf():
    pdf_bytes = build_analytics_pdf()
    filename = "wasteai-rapport-analytique.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.post("/analytics/report/email")
def email_analytics_report(payload: ReportEmailRequest):
    if "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Adresse email invalide.")

    try:
        send_analytics_report_email(payload.email, payload.subject, payload.message)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Echec d'envoi email: {exc}") from exc

    return {"status": "ok", "message": f"Rapport envoye a {payload.email}"}


@router.post("/identify-image", response_model=WasteImageIdentificationResult)
def identify_image_waste(payload: WasteImageIdentificationInput):
    media_type = payload.media_type
    if not media_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Media type invalide: image requise.")

    raw_data = payload.image_base64
    if "," in raw_data:
        raw_data = raw_data.split(",", 1)[1]

    try:
        content = base64.b64decode(raw_data, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Image base64 invalide.") from exc

    try:
        identified = identify_waste_from_image(
            image_bytes=content,
            media_type=media_type,
            filename=payload.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return WasteImageIdentificationResult(
        nom=str(identified.get("nom") or "dechet industriel"),
        categorie=identified.get("categorie", "autre"),
        type_dechet=identified.get("type_dechet", "autre"),
        confiance=str(identified.get("confiance") or "faible"),
        description_estimee=identified.get("description_estimee"),
        avertissement=identified.get("avertissement"),
    )


@router.get("/categories")
def get_categories():
    return {
        "categories": [
            "organique",
            "chimique",
            "metal",
            "plastique",
            "electronique",
            "papier",
            "verre",
            "autre",
        ],
        "types_dechets": [
            "biomasse_lignocellulosique",
            "boue_de_vidange",
            "huile_usagee",
            "textile",
            "plastique",
            "autre",
        ],
        "types_industrie": [
            "agroalimentaire",
            "metallurgie",
            "chimie",
            "textile",
            "automobile",
            "construction",
            "energie",
            "autre",
        ],
        "niveaux_danger": ["faible", "moyen", "eleve", "critique"],
        "caracteristiques_optionnelles": [
            "pays_cedeao",
            "sous_region_cedeao",
            "pci_mj_kg",
            "taux_lignine_pct",
            "dbo_mg_l",
            "dco_mg_l",
            "produit_principal",
            "composition_textile",
            "etat_textile",
            "origine_flux",
            "presence_metaux_lourds",
            "type_plastique",
            "taux_contamination_pct",
            "presence_colorants",
            "presence_additifs",
            "presence_chlore",
            "filiere_cimenterie_autorisee",
        ],
    }


@router.get("/references")
def get_references():
    return get_literature_db()


@router.get("/scientific-prefill")
def get_scientific_prefill_payload(
    nom: str = Query(..., min_length=1),
    type_dechet: str | None = Query(default=None),
    categorie: str | None = Query(default=None),
    description: str | None = Query(default=None),
):
    return get_scientific_prefill(
        nom=nom,
        type_dechet=type_dechet,
        categorie=categorie,
        description=description,
    )


@router.get("/regulations")
def get_regulations():
    return get_regulation_db()


@router.get("/environmental-factors")
def get_environmental_factors():
    return get_environmental_factors_db()


@router.get("/environmental-factors/template")
def get_environmental_factors_template_payload():
    return get_environmental_factors_template()


@router.put("/environmental-factors")
def update_environmental_factors(payload: EnvironmentalFactorsUpdateRequest, x_admin_key: str | None = Header(default=None)):
    _check_admin_access(x_admin_key)
    try:
        saved = update_environmental_factors_db(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "data": saved}


@router.get("/documentation")
def get_documentation():
    return {
        "scientifique": get_literature_db(),
        "reglementation_cedeao": get_regulation_db(),
        "facteurs_environnementaux_cedeao": get_environmental_factors_db(),
        "template_facteurs_environnementaux_cedeao": get_environmental_factors_template(),
    }





@router.post("/analytics/ml-explain")
def explain_ml_for_waste(
    waste: WasteInput,
    lookback_limit: int = Query(default=1200, ge=50, le=5000),
):
    return explain_ml_adjustments(waste, lookback_limit=lookback_limit)

@router.get("/analytics/compact")
def get_dashboard_analytics_compact(
    recent_limit: int = Query(default=20, ge=1, le=200),
    summary_window: int = Query(default=400, ge=20, le=5000),
):
    try:
        return get_analytics_compact(recent_limit=recent_limit, summary_window=summary_window)
    except Exception:
        logger.exception("Compact analytics endpoint failed")
        return {
            "summary": {
                "total_analyses": 0,
                "tonnes_valorisees": 0.0,
                "revenus_generes_eur": 0.0,
                "co2_evite_kg": 0.0,
            },
            "history": [],
            "meta": {
                "recent_limit": recent_limit,
                "summary_window": summary_window,
                "summary_total_records": 0,
                "fallback": True,
                "reason": "analytics_store_unavailable",
            },
        }
