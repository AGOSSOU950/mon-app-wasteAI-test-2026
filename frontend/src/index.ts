interface Env {
  ANALYSIS_API_URL?: string;
  ANALYSIS_API_KEY?: string;
}

type AnalysisResult = {
  type: string;
  confiance: number;
  source: "ia_externe" | "simulation";
  recommandation: string;
  explication: string;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json; charset=utf-8",
};

const DEFAULT_RESULT: AnalysisResult = {
  type: "dechet_industriel",
  confiance: 0.85,
  source: "simulation",
  recommandation: "Tri initial puis orientation vers filiere de valorisation adaptee",
  explication:
    "Analyse rapide activee dans le Worker pour eviter les timeouts. Une IA externe peut etre utilisee si configuree.",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS,
  });
}

function normalizeConfidence(value: unknown, fallback = 0.85): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function makeTextFallback(textHint?: string): AnalysisResult {
  const text = (textHint || "").toLowerCase();

  if (text.includes("plast")) {
    return {
      type: "plastique",
      confiance: 0.82,
      source: "simulation",
      recommandation: "Recyclage matiere (lavage, broyage, granulation)",
      explication:
        "Analyse texte uniquement. Orientation prioritaire vers la filiere plastique locale.",
    };
  }

  if (text.includes("papier") || text.includes("carton")) {
    return {
      type: "papier",
      confiance: 0.8,
      source: "simulation",
      recommandation: "Recyclage papier-carton et separation des impuretes",
      explication:
        "Analyse texte uniquement. Classement probable en filiere papier/carton.",
    };
  }

  if (text.includes("textile") || text.includes("coton") || text.includes("tissu")) {
    return {
      type: "textile",
      confiance: 0.81,
      source: "simulation",
      recommandation: "Reemploi, chiffons industriels ou recyclage fibre",
      explication:
        "Analyse texte uniquement. Classement probable en filiere textile.",
    };
  }

  return { ...DEFAULT_RESULT };
}

async function delegateExternalAI(
  env: Env,
  payload: Record<string, unknown>,
): Promise<AnalysisResult | null> {
  if (!env.ANALYSIS_API_URL) return null;

  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (env.ANALYSIS_API_KEY) {
      headers.Authorization = `Bearer ${env.ANALYSIS_API_KEY}`;
    }

    const response = await fetch(env.ANALYSIS_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;
    const result: AnalysisResult = {
      type: String(data.type ?? DEFAULT_RESULT.type),
      confiance: normalizeConfidence(data.confiance, DEFAULT_RESULT.confiance),
      source: "ia_externe",
      recommandation: String(data.recommandation ?? DEFAULT_RESULT.recommandation),
      explication: String(data.explication ?? "Resultat fourni par le service IA externe."),
    };

    return result;
  } catch {
    return null;
  }
}

async function parseRequestLight(request: Request): Promise<{
  hasImage: boolean;
  textHint: string;
  meta: Record<string, unknown>;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    let hasImage = false;
    const textFields: string[] = [];
    const meta: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        const isImage = value.type.startsWith("image/");
        if (isImage) {
          hasImage = true;
          meta.image = {
            field: key,
            name: value.name,
            type: value.type,
            size: value.size,
          };
        }
      } else {
        textFields.push(String(value));
        meta[key] = String(value);
      }
    }

    return {
      hasImage,
      textHint: textFields.join(" "),
      meta,
    };
  }

  if (contentType.includes("application/json")) {
    const data = (await request.json()) as Record<string, unknown>;
    const hint = [data.nom, data.description, data.categorie, data.type]
      .filter(Boolean)
      .map(String)
      .join(" ");

    return {
      hasImage: false,
      textHint: hint,
      meta: data,
    };
  }

  const text = await request.text();
  return { hasImage: false, textHint: text, meta: { raw: text.slice(0, 300) } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (request.method !== "POST") {
        return jsonResponse(
          {
            error: "Method not allowed",
            expected: "POST",
          },
          405,
        );
      }

      const { hasImage, textHint, meta } = await parseRequestLight(request);

      // Worker side stays lightweight: no heavy image processing.
      const externalPayload: Record<string, unknown> = {
        mode: hasImage ? "image_metadata" : "text_only",
        textHint,
        metadata: meta,
        context: "benin_cedeao",
      };

      const externalResult = await delegateExternalAI(env, externalPayload);
      if (externalResult) {
        return jsonResponse(externalResult);
      }

      const fallback = makeTextFallback(textHint);
      if (hasImage) {
        fallback.explication =
          "Image detectee. Traitement local lourd desactive dans le Worker pour stabilite. Resultat de simulation rapide retourne.";
      }

      return jsonResponse(fallback);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse(
        {
          type: "inconnu",
          confiance: 0.6,
          source: "simulation",
          recommandation: "Reessayer avec une image plus legere ou une description texte",
          explication: `Erreur geree sans crash: ${message}`,
        },
        200,
      );
    }
  },
};



