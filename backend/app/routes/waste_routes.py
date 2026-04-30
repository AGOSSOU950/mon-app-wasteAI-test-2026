from pathlib import Path
import json
import base64
import io
import os
import logging
import re
import urllib.parse
import urllib.request

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
from app.core.valorization_registry import get_valorization_filieres, get_valorization_registry, get_valorization_registry_audit, get_valorization_registry_template, update_valorization_registry, updateWeights, get_decision_history, export_recommendations
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

_BENIN_WASTE_DB_PATH = Path(__file__).resolve().parents[1] / "core" / "waste_benin_database.json"
_CORRECTIONS_PATH = Path(__file__).resolve().parents[1] / "core" / "corrections.json"


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



class ValorizationRegistryUpdateRequest(BaseModel):
    version: str
    updated_at: str | None = None
    filieres: list[dict[str, object]]


class FiliereFeedbackRequest(BaseModel):
    feedback: str

class IdentificationCorrectionRequest(BaseModel):
    image_filename: str | None = None
    prediction: dict[str, object] = {}
    is_correct: bool
    corrected_nom_exact: str | None = None
    corrected_filiere: str | None = None
    corrected_comment: str | None = None
    user_context: dict[str, object] = {}

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



def _is_http_image_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urllib.parse.urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _decode_identification_image(payload: WasteImageIdentificationInput) -> tuple[bytes, str]:
    image_value = str(payload.image_base64 or "").strip()
    image_url = str(payload.image_url or "").strip()
    media_type = str(payload.media_type or "").strip().lower()

    logger.info(
        "Image recue: has_base64=%s has_url=%s media_type=%s chars=%s",
        bool(image_value),
        bool(image_url),
        media_type or "",
        len(image_value),
    )

    if not image_url and _is_http_image_url(image_value):
        image_url = image_value
        image_value = ""

    if image_url:
        if not _is_http_image_url(image_url):
            raise HTTPException(status_code=400, detail="Aucune image valide re\u00e7ue")
        try:
            request = urllib.request.Request(
                image_url,
                headers={"User-Agent": "WasteAI/1.0"},
                method="GET",
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                content = response.read()
                fetched_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Aucune image valide re\u00e7ue") from exc

        resolved_media_type = fetched_type if fetched_type.startswith("image/") else (media_type or "image/jpeg")
        if not resolved_media_type.startswith("image/") or not content:
            raise HTTPException(status_code=400, detail="Aucune image valide re\u00e7ue")
        return content, resolved_media_type

    if not image_value:
        raise HTTPException(status_code=400, detail="Aucune image valide re\u00e7ue")

    data_uri = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", image_value, re.DOTALL)
    if data_uri:
        media_type = data_uri.group(1).strip().lower()
        raw_data = data_uri.group(2).strip()
    else:
        raw_data = image_value.split(",", 1)[1].strip() if image_value.lower().startswith("data:") and "," in image_value else image_value

    if not media_type or not media_type.startswith("image/"):
        media_type = "image/jpeg"

    try:
        content = base64.b64decode(raw_data, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Aucune image valide re\u00e7ue") from exc

    if not content:
        raise HTTPException(status_code=400, detail="Aucune image valide re\u00e7ue")

    return content, media_type


@router.post("/identify-image", response_model=WasteImageIdentificationResult)
def identify_image_waste(payload: WasteImageIdentificationInput):
    content, media_type = _decode_identification_image(payload)

    try:
        identified = identify_waste_from_image(
            image_bytes=content,
            media_type=media_type,
            filename=payload.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    confidence_value = identified.get("confidence")
    if confidence_value is None:
        confidence_value = float(identified.get("confiance_identification") or 32) / 100.0
    confidence = float(confidence_value)

    status_value = identified.get("status")
    if not status_value:
        status_value = "identified" if confidence >= 0.5 else "uncertain"

    return WasteImageIdentificationResult(
        waste_name=str(identified.get("waste_name") or identified.get("nom_exact") or identified.get("nom") or "dechet solide non identifie"),
        confidence=confidence,
        status=str(status_value),
        name=identified.get("name"),
        guess=identified.get("guess"),
        description=identified.get("description"),
        technical_description=identified.get("technical_description"),
        ux_message=identified.get("ux_message"),
        nom=str(identified.get("nom") or identified.get("waste_name") or "dechet solide non identifie"),
        categorie=identified.get("categorie", "autre"),
        type_dechet=identified.get("type_dechet", "autre"),
        confiance=str(identified.get("confiance") or "faible"),
        description_estimee=identified.get("description_estimee"),
        avertissement=identified.get("avertissement"),
        nom_exact=identified.get("nom_exact"),
        filiere=identified.get("filiere"),
        sous_type=identified.get("sous_type"),
        origine_probable=identified.get("origine_probable"),
        qualite=identified.get("qualite"),
        valorisation_1=identified.get("valorisation_1") if isinstance(identified.get("valorisation_1"), dict) else {},
        valorisation_2=identified.get("valorisation_2") if isinstance(identified.get("valorisation_2"), dict) else {},
        acheteurs_benin=identified.get("acheteurs_benin") if isinstance(identified.get("acheteurs_benin"), list) else [],
        acheteurs_cedeao=identified.get("acheteurs_cedeao") if isinstance(identified.get("acheteurs_cedeao"), list) else [],
        impact_co2_kg=identified.get("impact_co2_kg"),
        conseil_stockage=identified.get("conseil_stockage"),
        niveau_danger=identified.get("niveau_danger"),
        score_valorisation=identified.get("score_valorisation"),
        confiance_identification=identified.get("confiance_identification"),
        explication=identified.get("explication"),
        hypotheses=identified.get("hypotheses") if isinstance(identified.get("hypotheses"), list) else [],
    )

@router.post("/identify-image/corrections")
def save_identification_correction(payload: IdentificationCorrectionRequest):
    entry = {
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "image_filename": payload.image_filename,
        "prediction": payload.prediction,
        "is_correct": payload.is_correct,
        "corrected_nom_exact": payload.corrected_nom_exact,
        "corrected_filiere": payload.corrected_filiere,
        "corrected_comment": payload.corrected_comment,
        "user_context": payload.user_context,
    }

    try:
        if _CORRECTIONS_PATH.exists():
            existing = json.loads(_CORRECTIONS_PATH.read_text(encoding="utf-8"))
            if not isinstance(existing, list):
                existing = []
        else:
            existing = []

        existing.append(entry)
        _CORRECTIONS_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"status": "ok", "saved": True, "count": len(existing)}
    except Exception as exc:
        logger.exception("Failed to save identification correction")
        raise HTTPException(status_code=500, detail=f"Echec sauvegarde correction: {exc}") from exc
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
            "taux_humidite_pct",
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
        ],
    }


@router.get("/references")
def get_references():
    return get_literature_db()


@router.get("/valorization-filieres")
def get_valorization_filieres_payload():
    return get_valorization_registry()


@router.get("/valorization-filieres/audit")
def get_valorization_filieres_audit():
    return get_valorization_registry_audit()


@router.get("/valorization-filieres/history")
def get_valorization_history(limit: int = Query(default=100, ge=1, le=1000)):
    return {"history": get_decision_history(limit=limit)}


@router.post("/valorization-filieres/{filiere_id}/feedback")
def update_valorization_filiere_feedback(filiere_id: str, payload: FiliereFeedbackRequest, x_admin_key: str | None = Header(default=None)):
    _check_admin_access(x_admin_key)
    try:
        updated = updateWeights(filiere_id, payload.feedback)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "data": updated}


@router.post("/recommendations/export")
def export_waste_recommendations(payload: WasteInput):
    result = analyser_dechet(payload)
    return export_recommendations(result.classement_filieres or [], payload.model_dump())
@router.get("/valorization-filieres/template")
def get_valorization_filieres_template_payload():
    return get_valorization_registry_template()


@router.put("/valorization-filieres")
def update_valorization_filieres(payload: ValorizationRegistryUpdateRequest, x_admin_key: str | None = Header(default=None)):
    _check_admin_access(x_admin_key)
    try:
        saved = update_valorization_registry(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "data": saved}


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
        "valorisation_filieres_cedeao": get_valorization_registry(),
        "template_valorisation_filieres_cedeao": get_valorization_registry_template(),
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

@router.get("/database/benin")
def get_benin_waste_database():
    try:
        payload = json.loads(_BENIN_WASTE_DB_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload
    except Exception:
        logger.exception("Benin waste database endpoint failed")

    return {
        "country": "Benin",
        "currency": "FCFA",
        "version": "fallback",
        "wastes": [],
    }




