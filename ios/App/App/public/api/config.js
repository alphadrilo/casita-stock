// Casita Stock — configuración pública para la app.
// La URL de Supabase y la llave "anon" son públicas por diseño: las reglas de acceso de la base de datos
// (schema.sql) son las que protegen los datos. La llave de la IA NO se envía nunca.
// La app nativa de iPhone (Xcode) llama desde capacitor://localhost
const ORIGENES = ["capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost"];
function cors(req, res) {
  const o = req.headers && req.headers.origin;
  if (o && ORIGENES.includes(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    ia: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
