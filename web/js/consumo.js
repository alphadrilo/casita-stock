/* Casita Stock — Consumo Inteligente.
   Aprende cuánto dura cada unidad (un rollo, una botella, un paquete) con los cambios que registra la familia,
   y estima cuánto queda y cuándo se acaba.

   Dónde se guarda: dentro del mismo producto (colección "productos" de la tabla documentos, con sus reglas RLS):
     p.cantidad              unidades SIN ABRIR, confirmadas (lo que se cuenta en casa)
     p.consumo.activo        true si este producto se mide
     p.consumo.abierto       ms: cuándo se empezó la unidad que está en uso (null si no hay una abierta)
     p.consumo.eventos       [{k:"abrir"|"fin"|"corregir", ts, d?, u?, n?}]  (d = cuánto duró la unidad anterior, en ms)
     p.consumo.avisarDias    con cuántos días de anticipación avisar
     p.consumo.aviso         {f, dias}: la última vez que la persona tocó "Ahora no"
     p.consumo.ref           unidades de referencia para la barra (las que había al comprar)
   Regla clave: nada se descuenta solo por el paso del tiempo. "cantidad" cambia solo con lo que la persona registra;
   el tiempo solo se usa para ESTIMAR cuánto queda de la unidad abierta. */
const Consumo = (() => {
  const DIA = 864e5;
  const MAX_EVENTOS = 60;
  const VENTANA_DUPLICADO = 10 * 60e3; // 10 minutos

  const dia = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const mediana = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const desv = (a) => { const m = media(a); return Math.sqrt(media(a.map((x) => (x - m) ** 2))); };

  const activo = (p) => !!(p && p.consumo && p.consumo.activo);
  const eventos = (p) => (p && p.consumo && p.consumo.eventos) || [];

  /* Duración de cada unidad, en días, de la más antigua a la más reciente.
     Con 3 o más, se ignoran las que no tienen sentido (un olvido de registrar o un toque doble). */
  function duraciones(p) {
    const ds = eventos(p).filter((e) => e.d > 0).map((e) => e.d / DIA);
    if (ds.length < 3) return { usadas: ds, ignoradas: 0 };
    const m = mediana(ds);
    const usadas = ds.filter((d) => d <= m * 3 && d >= m / 4);
    return { usadas, ignoradas: ds.length - usadas.length };
  }

  /* Estimación provisional cuando todavía no hay cambios registrados:
     1) por las compras (cuántas unidades se compran y cada cuánto), 2) por los "Usé 1" de antes. */
  function provisional(p, t) {
    const h = (p.historial || []);
    const compras = h.filter((x) => x.t === "c" && x.f);
    if (compras.length >= 2) {
      const ini = Date.parse(compras[0].f), fin = Date.parse(compras[compras.length - 1].f);
      const dias = (fin - ini) / DIA;
      const unidades = compras.slice(0, -1).reduce((s, x) => s + (+x.n || 0), 0);
      if (dias >= 7 && unidades > 0) return { est: dias / unidades, fuente: "compras" };
    }
    const lim = t - 60 * DIA;
    const usos = h.filter((x) => x.t === "u" && x.f && Date.parse(x.f) >= lim);
    const usados = usos.reduce((s, x) => s + (+x.n || 0), 0);
    if (usados >= 2) {
      const primero = Math.min(...usos.map((x) => Date.parse(x.f)));
      return { est: Math.max(7, (t - primero) / DIA) / usados, fuente: "usos" };
    }
    return null;
  }

  /* Todo lo que la ficha, las alertas y Lilu necesitan saber. */
  function estimar(p, t = Date.now()) {
    const c = (p && p.consumo) || {};
    const { usadas, ignoradas } = duraciones(p);
    let est = null, fuente = "", conf = "baja", cv = null;
    if (usadas.length) {
      // Promedio que pesa más lo reciente: se adapta si la familia cambia su consumo
      est = usadas[0];
      for (const d of usadas.slice(1)) est = 0.35 * d + 0.65 * est;
      cv = usadas.length > 1 ? desv(usadas) / media(usadas) : null;
      fuente = "cambios";
      conf = usadas.length >= 5 && cv <= 0.35 ? "alta" : usadas.length >= 2 && (cv === null || cv <= 0.6) ? "media" : "baja";
    } else {
      const pv = provisional(p, t);
      if (pv) { est = pv.est; fuente = pv.fuente; }
    }
    const abierto = c.abierto || null;
    const transcurrido = abierto ? Math.max(0, (t - abierto) / DIA) : 0;
    let revisar = false;
    if (est != null && abierto && transcurrido > est) {
      // La unidad abierta ya dura más que el promedio: el consumo real cambia la estimación
      const n = Math.max(1, usadas.length);
      est = (est * n + transcurrido) / (n + 1);
      revisar = transcurrido > Math.max(est * 2, est + 3);
    }
    const sinAbrir = Math.max(0, +p.cantidad || 0);
    let restanteAbierto = 0, fraccion = 0;
    if (abierto) {
      fraccion = est ? Math.max(0.05, 1 - transcurrido / est) : 0.5;
      restanteAbierto = est ? Math.max(est * 0.05, est - transcurrido) : 0;
    }
    const dias = est == null ? null : sinAbrir * est + restanteAbierto;
    const unidadesEst = sinAbrir + (abierto ? fraccion : 0);
    const ref = Math.max(+c.ref || 0, Math.ceil(unidadesEst), 1);
    return {
      activo: !!c.activo, est, porDia: est ? 1 / est : null, n: usadas.length, ignoradas, conf, fuente, cv,
      abierto, transcurrido, revisar, sinAbrir, unidadesEst, ref, nivel: Math.min(1, unidadesEst / ref),
      dias, agota: dias == null ? null : dia(t + dias * DIA), avisarDias: c.avisarDias || 5,
    };
  }

  /* El último registro de la familia, si fue hace poco (para no descontar dos veces) */
  function reciente(p, t = Date.now(), ventana = VENTANA_DUPLICADO) {
    const e = eventos(p).filter((x) => x.k === "abrir" || x.k === "fin").slice(-1)[0];
    return e && t - e.ts >= 0 && t - e.ts < ventana ? { ...e, hace: t - e.ts } : null;
  }

  const agregarEvento = (c, e) => { c.eventos = [...(c.eventos || []), e].slice(-MAX_EVENTOS); };
  const copia = (p) => JSON.parse(JSON.stringify(p));

  /* Abrir una unidad nueva ("cambié el rollo"). Si había una abierta, se terminó: se guarda cuánto duró.
     Descuenta 1 de las unidades sin abrir. Si no queda ninguna, solo marca que la abierta se terminó. */
  function abrir(p, { ts = Date.now(), u = "" } = {}) {
    const np = copia(p);
    const c = np.consumo = { avisarDias: 5, ...(np.consumo || {}), activo: true };
    const prev = c.abierto;
    const d = prev && ts > prev && ts - prev < 365 * DIA ? ts - prev : 0;
    if ((+np.cantidad || 0) <= 0) return terminar(p, { ts, u });
    np.cantidad = (+np.cantidad || 0) - 1;
    const e = { k: "abrir", ts };
    if (d) e.d = d;
    if (u) e.u = u;
    agregarEvento(c, e);
    c.abierto = ts;
    c.ref = Math.max(+c.ref || 0, np.cantidad + 1);
    np.historial = [...(np.historial || []), { t: "u", n: 1, f: dia(ts), ...(u ? { u } : {}) }].slice(-40);
    return np;
  }

  /* La unidad abierta se terminó y no se abrió otra */
  function terminar(p, { ts = Date.now(), u = "" } = {}) {
    const np = copia(p);
    const c = np.consumo = { avisarDias: 5, ...(np.consumo || {}), activo: true };
    const prev = c.abierto;
    const e = { k: "fin", ts };
    if (prev && ts > prev && ts - prev < 365 * DIA) e.d = ts - prev;
    if (u) e.u = u;
    agregarEvento(c, e);
    c.abierto = null;
    return np;
  }

  /* Empezar a medir. Si ya hay una unidad en uso, "desde" es cuándo se abrió: se toma de las sin abrir. */
  function empezar(p, { abierto = true, desde = Date.now(), u = "", avisarDias = 5 } = {}) {
    let np = copia(p);
    np.consumo = { ...(np.consumo || {}), activo: true, avisarDias: (np.consumo && np.consumo.avisarDias) || avisarDias, eventos: (np.consumo && np.consumo.eventos) || [] };
    np.consumo.ref = Math.max(+np.consumo.ref || 0, (+np.cantidad || 0));
    if (abierto && !np.consumo.abierto) {
      if ((+np.cantidad || 0) > 0) np = abrir(np, { ts: desde, u });
      else np.consumo.abierto = desde; // ya está usando la última
    }
    return np;
  }

  /* Corrección manual: deja las cantidades exactas. No cuenta como consumo. */
  function corregir(p, { sinAbrir, hayAbierto, ts = Date.now(), u = "" } = {}) {
    const np = copia(p);
    const c = np.consumo = { avisarDias: 5, ...(np.consumo || {}), activo: true };
    const antes = +np.cantidad || 0, nuevo = Math.max(0, Math.round(+sinAbrir || 0));
    if (nuevo !== antes) {
      np.cantidad = nuevo;
      np.historial = [...(np.historial || []), { t: "a", n: nuevo - antes, f: dia(ts), ...(u ? { u } : {}) }].slice(-40);
      if (nuevo === 0 && !hayAbierto) np.vence = "";
    }
    if (hayAbierto === false) c.abierto = null;
    else if (hayAbierto === true && !c.abierto) c.abierto = ts;
    c.ref = Math.max(+c.ref || 0, nuevo + (c.abierto ? 1 : 0));
    agregarEvento(c, { k: "corregir", ts, n: nuevo, a: !!c.abierto, ...(u ? { u } : {}) });
    return np;
  }

  /* Al comprar: la barra toma como referencia lo que hay después de la compra */
  function alComprar(p) {
    if (!activo(p)) return p;
    const np = copia(p);
    np.consumo.ref = (+np.cantidad || 0) + (np.consumo.abierto ? 1 : 0);
    np.consumo.aviso = null;
    return np;
  }

  /* ¿Toca avisar? Solo si hay estimación, faltan pocos días y la persona no dijo "Ahora no" hace poco.
     enLista: si ya está en la lista de compras no se avisa. */
  function alerta(p, { enLista = false, t = Date.now() } = {}) {
    if (!activo(p) || enLista) return null;
    const e = estimar(p, t);
    if (e.dias == null || e.dias > e.avisarDias) return null;
    const a = p.consumo.aviso;
    if (a && a.f) {
      const pasaron = (Date.parse(dia(t)) - Date.parse(a.f)) / DIA;
      const urgenteAhora = e.dias <= 2 && (a.dias == null || a.dias > 2);
      if (pasaron < 3 && !urgenteAhora) return null;
    }
    return { dias: e.dias, provisional: e.conf === "baja", est: e };
  }
  function posponer(p, { t = Date.now() } = {}) {
    const np = copia(p);
    const e = estimar(np, t);
    np.consumo.aviso = { f: dia(t), dias: e.dias == null ? null : Math.round(e.dias * 10) / 10 };
    return np;
  }

  /* Cantidad por día cuando el tamaño dice ml, L, g, kg, oz o lb (ej. "2 L" que dura 25 días ≈ 80 ml por día) */
  function porDiaMedida(p, est) {
    const m = String((p && p.tamano) || "").toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(ml|l|lt|litros?|g|gr|gramos?|kg|oz|lb)\b/);
    if (!m || !est) return null;
    let v = +m[1], u = m[2];
    if (/^(l|lt|litro|litros)$/.test(u)) { v *= 1000; u = "ml"; } else if (u === "kg") { v *= 1000; u = "g"; } else if (/^(gr|gramo|gramos)$/.test(u)) u = "g";
    const x = v / est;
    if (u === "ml" && x >= 1000) return { cantidad: Math.round(x / 100) / 10, unidad: "L" };
    if (u === "g" && x >= 1000) return { cantidad: Math.round(x / 100) / 10, unidad: "kg" };
    return { cantidad: x >= 10 ? Math.round(x) : Math.round(x * 10) / 10, unidad: u };
  }

  return { activo, estimar, abrir, terminar, empezar, corregir, alComprar, alerta, posponer, reciente, duraciones, porDiaMedida, eventos, DIA, VENTANA_DUPLICADO };
})();
if (typeof module !== "undefined") module.exports = Consumo;
