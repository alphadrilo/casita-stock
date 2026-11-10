// Casita Stock — puente seguro con la IA de Claude.
// La llave de la API vive solo aquí (variable ANTHROPIC_API_KEY en Vercel); el teléfono nunca la ve.
// Solo responde a personas con sesión iniciada en Casita Stock.

const MODELOS = {
  quick: process.env.MODELO_RAPIDO || "claude-haiku-5-5",
  default: process.env.MODELO_ESTANDAR || "claude-sonnet-5-5",
  complex: process.env.MODELO_COMPLEJO || process.env.MODELO_ESTANDAR || "claude-sonnet-5-5",
};
const MAX_TOKENS = 2000;      // por defecto
const MAX_TOKENS_TOPE = 8000; // facturas largas pueden pedir más
const MAX_CUERPO = 4_400_000; // bytes (Vercel acepta hasta 4,5 MB por llamada)
const LIMITE_POR_MINUTO = 40;
const usos = new Map(); // límite simple por persona (por instancia del servidor)

// La app nativa de iPhone (Xcode) llama desde capacitor://localhost
const ORIGENES = ["capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost"];
function cors(req, res) {
  const o = req.headers && req.headers.origin;
  if (o && ORIGENES.includes(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function error(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

async function usuarioDeSesion(token) {
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return error(res, 405, "invalid_request", "Usa POST");
  if (!process.env.ANTHROPIC_API_KEY) return error(res, 503, "sampling_disabled", "Falta configurar ANTHROPIC_API_KEY en Vercel");

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let user;
  try { user = await usuarioDeSesion(token); } catch { user = null; }
  if (!user) return error(res, 401, "session_expired", "Inicia sesión otra vez");

  const ahora = Date.now();
  const lista = (usos.get(user.id) || []).filter((t) => ahora - t < 60_000);
  if (lista.length >= LIMITE_POR_MINUTO) return error(res, 429, "rate_limited", "Demasiadas consultas seguidas");
  lista.push(ahora); usos.set(user.id, lista);

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (JSON.stringify(body).length > MAX_CUERPO) return error(res, 413, "prompt_too_large", "La consulta es demasiado grande");
  const { tier = "default", messages, tools, system, max_tokens } = body;
  if (!Array.isArray(messages) || !messages.length) return error(res, 400, "invalid_request", "Faltan los mensajes");

  const pedido = {
    model: MODELOS[tier] || MODELOS.default,
    max_tokens: Math.min(Number(max_tokens) || MAX_TOKENS, MAX_TOKENS_TOPE),
    messages,
  };
  if (system) pedido.system = String(system);
  if (Array.isArray(tools) && tools.length) pedido.tools = tools.slice(0, 10);

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(pedido),
    });
  } catch {
    return error(res, 502, "upstream_error", "No se pudo contactar a la IA");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = r.status === 429 || r.status === 529 ? "rate_limited"
      : r.status === 401 || r.status === 403 ? "sampling_disabled"
      : r.status === 400 ? "invalid_request" : "upstream_error";
    return error(res, r.status === 400 ? 400 : 502, code, (data.error && data.error.message) || "La IA no respondió");
  }
  res.status(200).json({ content: data.content || [], stop_reason: data.stop_reason, model: data.model });
}
