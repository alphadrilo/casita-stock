/* Casita Stock — Escáner inteligente de facturas (versión 1.3)
   1. Fotos (una o varias páginas) o PDF de la factura.
   2. La IA lee tienda, fecha, productos, cantidades, precios, descuentos, impuestos y total.
   3. Cada línea se compara con el inventario: ya existe (se suma), nuevo (se crea) o por revisar (pide confirmación).
   4. La persona corrige y confirma. Nada cambia en el inventario antes de "Guardar".
   5. Se guarda en el historial de compras (colección "compras", misma tabla documentos, sincronizada).
   Usa las funciones de app.js (inventory, store, applyPurchase, setPack, newProduct…) y de asistente.js (keyOf, localMatch, plain). */

const FAC_MAX_BODY = 4.0e6;   // bytes en base64 por lectura (Vercel acepta hasta 4,5 MB)
const FAC_MAX_PDF = 3e6;      // PDF de hasta 3 MB
const FAC_LADO = 1568;        // lado largo que la IA lee sin reducir la imagen
const FAC_MAX_PIEZAS = 20;
const FAC_ERR = {
  no_factura: "No encontré una factura de compra en esas imágenes. Toma la foto con la factura completa y bien iluminada.",
  too_big: "Las fotos pesan demasiado para leerlas juntas. Quita alguna página o tómalas un poco más lejos.",
  prompt_too_large: "Las fotos pesan demasiado para leerlas juntas. Quita alguna página o tómalas un poco más lejos.",
  truncada: "La factura tiene demasiados productos para leerla de una vez. Léela en dos partes: primero unas páginas y luego las demás.",
  upstream_error: "No se pudo terminar la lectura. Revisa tu conexión y vuelve a intentarlo.",
};
let fac = { pages: [], state: "idle", err: "", from: "add", ctl: null };
let facRev = null;
let histPer = "mes", histBorrar = null;

const compraId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const facR2 = (n) => Math.round(n * 100) / 100;
const facNum = (x) => (x == null || x === "" || !isFinite(+x) ? null : facR2(+x));
const facClave = (linea) => plain(linea).replace(/\b\d{5,}\b/g, " ").replace(/\s+/g, " ").trim();

/* Historial de compras: una compra por factura, compra grande o lista */
function guardarCompra(id, data) {
  if (!data.items || !data.items.length) return Promise.resolve();
  return store.set("compras", id, { ...data, creado: Date.now(), u: me || "" });
}

function abrirFactura(from) {
  fac = { pages: [], state: "idle", err: "", from: from || "add", ctl: null };
  facRev = null;
  openScreen("factura", from || "add");
}

/* ---------------- 1. Páginas: fotos y PDF ---------------- */
async function facCortar(img, q = 0.82, lado = FAC_LADO) {
  // Las facturas largas se cortan en tramos (con un poco de traslape) para que la IA lea la letra pequeña
  const w = img.width, h = img.height;
  const ratio = h / w;
  const tramos = ratio > 2.2 ? Math.min(6, Math.ceil(ratio / 1.8)) : 1;
  const alto = Math.ceil(h / tramos), solape = tramos > 1 ? Math.round(alto * 0.06) : 0;
  const out = [];
  for (let i = 0; i < tramos; i++) {
    const y0 = Math.max(0, i * alto - solape), y1 = Math.min(h, (i + 1) * alto + solape);
    const sh = y1 - y0, s = Math.min(1, lado / Math.max(w, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(sh * s));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, y0, w, sh, 0, 0, c.width, c.height);
    out.push(await new Promise((r) => c.toBlob(r, "image/jpeg", q)));
  }
  return out.filter(Boolean);
}
const facPeso = () => fac.pages.reduce((a, p) => a + p.blobs.reduce((b, x) => b + x.size, 0), 0) * 4 / 3;
const facPiezas = () => fac.pages.reduce((a, p) => a + p.blobs.length, 0);

async function facAgregar(files) {
  fac.err = "";
  for (const f of files) {
    const esPdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name || "");
    if (esPdf) {
      if (f.size > FAC_MAX_PDF) { fac.err = "Ese PDF pesa más de 3 MB. Toma fotos de la factura o guarda el PDF con menos páginas."; continue; }
      const blob = f.type === "application/pdf" ? f : new Blob([f], { type: "application/pdf" });
      fac.pages.push({ id: uid(), tipo: "pdf", nombre: f.name || "Factura.pdf", blobs: [blob] });
      continue;
    }
    try {
      const img = await loadImg(f);
      const blobs = await facCortar(img);
      fac.pages.push({ id: uid(), tipo: "img", file: f, thumb: resize(img, 220).toDataURL("image/jpeg", 0.7), blobs });
      if (img.close) img.close();
    } catch (e) { fac.err = "No se pudo abrir una de las fotos. Prueba con otra."; }
  }
  if (facPiezas() > FAC_MAX_PIEZAS) fac.err = "Son muchas páginas para una sola lectura. Quita algunas y lee la factura en dos partes.";
}
async function facReducir() {
  // Si pesan demasiado, se vuelven a comprimir con menos calidad
  for (const p of fac.pages) if (p.tipo === "img" && p.file) {
    try { const img = await loadImg(p.file); p.blobs = await facCortar(img, 0.62, 1300); if (img.close) img.close(); } catch (e) {}
  }
}

/* ---------------- 2. Lectura con IA ---------------- */
function facPrompt(n) {
  const inv = inventory.slice(0, 400).map((p) => {
    const o = { id: p.id, nombre: p.nombre };
    if (p.marca) o.marca = p.marca; if (p.tamano) o.tamano = p.tamano;
    if ((p.aliasFactura || []).length) o.enFacturas = p.aliasFactura.slice(-4);
    return o;
  });
  return `Eres un lector experto de facturas (recibos de compra) de supermercados de Estados Unidos y Latinoamérica: Costco, Sam's Club, BJ's, Stop & Shop, ShopRite, Walmart, Target, Aldi, Trader Joe's, Whole Foods, Publix, Kroger, CVS, Walgreens, bodegas y otros.
Te envío ${n === 1 ? "1 imagen o PDF" : n + " imágenes o PDF"} de UNA sola compra, en orden. Si son tramos de una factura larga, van de arriba hacia abajo y pueden repetir 1 o 2 líneas en el borde: no cuentes dos veces la misma línea.
Fecha de hoy: ${today()}.

Responde SOLO un objeto JSON con esta forma exacta:
{"esFactura":true,
 "tienda":"nombre del supermercado, ej. Costco",
 "fecha":"AAAA-MM-DD de la compra, o vacío si no se ve",
 "moneda":"USD",
 "subtotal":número o null, "impuestos":número o null, "descuentos":número positivo con el total ahorrado o null, "total":número pagado o null,
 "items":[{"linea":"texto del producto tal como sale en la factura",
   "nombre":"nombre claro en español, ej. Toallas de papel",
   "marca":"marca o vacío",
   "tamano":"contenido, peso o tamaño, ej. 12 rollos o 2.3 lb, o vacío",
   "categoria":"una de: ${CATS.join(", ")}",
   "cantidad":número entero de unidades o paquetes comprados (si se vende por peso, 1),
   "precioUnitario":precio de cada unidad o paquete antes de descuento, o null,
   "total":importe de la línea después de descuentos, o null,
   "descuento":número positivo ahorrado en esa línea, o 0,
   "codigo":"código UPC o EAN de 8 a 14 dígitos si aparece, si no vacío",
   "productoId":"id del producto del inventario si es claramente el mismo, si no vacío",
   "confianza":"alta, media o baja",
   "duda":"si algo no se lee bien o no estás seguro, explícalo en una frase corta; si no, vacío"}],
 "notas":"algo importante que la persona deba saber, o vacío"}

Reglas:
- Un item por producto comprado. Si el mismo producto sale en varias líneas iguales, únelas sumando la cantidad.
- Descuentos, cupones, "instant savings", "TPD", "rollback" o "you saved" van en "descuento" del producto al que se aplican. No son items.
- Impuestos, subtotales, totales, cambio, pagos, puntos, depósitos de envases, bolsas, propinas y cargos no son items.
- Expande abreviaturas: "KS" = Kirkland Signature, "GV" = Great Value, "MM" = Member's Mark, "ORG" = orgánico, "MLK" = leche, "BNLS" = sin hueso.
- Si un precio o una cantidad no se lee, pon null y explícalo en "duda". No inventes números.
- Para "productoId" usa SOLO ids de la lista del inventario de abajo y solo si es el mismo producto (mismo tipo, y misma marca si se ve). Si no estás seguro, déjalo vacío y pon "confianza" media o baja.
Inventario de la casa (id, nombre, marca, tamaño y cómo salió en facturas anteriores):
${JSON.stringify(inv)}
Si las imágenes no son una factura de compra, responde {"esFactura":false,"items":[]}.`;
}

async function facLeer() {
  if (fac.state === "busy" || !fac.pages.length) return;
  if (aiState !== "ready") { fac.state = "err"; fac.err = "La IA no está conectada. Revisa la guía de instalación."; render(); return; }
  fac.state = "busy"; fac.err = ""; fac.ctl = new AbortController(); render();
  try {
    if (facPeso() > FAC_MAX_BODY) await facReducir();
    if (facPeso() > FAC_MAX_BODY || facPiezas() > FAC_MAX_PIEZAS) throw { code: "too_big" };
    const files = fac.pages.flatMap((p) => p.blobs);
    const r = await sample.json(facPrompt(files.length), { files, modelTier: "default", maxTokens: 8000, signal: fac.ctl.signal });
    if (!r || r.esFactura === false || !Array.isArray(r.items) || !r.items.length) throw { code: "no_factura" };
    facRev = facPreparar(r);
    fac.state = "idle"; fac.ctl = null;
    if (tab === screenTab) { screen = "facrev"; render(); scrollTo(0, 0); }
    return;
  } catch (e) {
    if (e && e.code === "cancelled") { fac.state = "idle"; fac.err = ""; }
    else {
      if (aiHardOff(e)) aiState = "off";
      fac.state = "err";
      fac.err = e && e.code === "invalid_json" && /incompleta/i.test(e.message || "") ? FAC_ERR.truncada : FAC_ERR[e && e.code] || aiMsg(e);
    }
  }
  fac.ctl = null;
  if (screen === "factura") render();
}

/* ---------------- 3. Comparar con el inventario ---------------- */
function facPreparar(r) {
  const ids = new Set(inventory.map((p) => p.id));
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || "") && r.fecha <= today() ? r.fecha : today();
  let rows = r.items.filter((it) => it && (it.nombre || it.linea)).map((it) => {
    const linea = String(it.linea || "").trim();
    const nombre = cap(String(it.nombre || linea).trim());
    const codigo = String(it.codigo || "").replace(/\D/g, "");
    const conf = ["alta", "media", "baja"].includes(it.confianza) ? it.confianza : "media";
    let pid = "", como = "";
    const kl = facClave(linea);
    if (kl) { const p = inventory.find((x) => (x.aliasFactura || []).includes(kl)); if (p) { pid = p.id; como = "aprendido"; } }
    if (!pid && codigo.length >= 8) { const p = inventory.find((x) => x.codigo === codigo || (x.paquetes && x.paquetes[codigo])); if (p) { pid = p.id; como = "codigo"; } }
    if (!pid && ids.has(it.productoId)) { pid = it.productoId; como = "ia"; }
    if (!pid) { const p = localMatch(nombre, false); if (p) { pid = p.id; como = "nombre"; } }
    const cantidad = Math.max(1, Math.round(+it.cantidad || 1));
    const desc = Math.abs(facNum(it.descuento) || 0);
    let pu = facNum(it.precioUnitario), tot = facNum(it.total);
    if (pu == null && tot != null) pu = facR2((tot + desc) / cantidad);
    const duda = String(it.duda || "").trim();
    const seguro = como === "aprendido" || como === "codigo";
    const revisar = !!duda || pu == null || conf === "baja" || (!seguro && pid && conf !== "alta") || !nombre;
    const estado = revisar ? "revisar" : pid ? "existe" : "nuevo";
    const cat = CATS.includes(it.categoria) ? it.categoria : "Otros";
    return { key: uid(), linea, nombre, marca: String(it.marca || "").trim(), tamano: String(it.tamano || "").trim(), categoria: cat, codigo,
      cantidad, precio: pu != null ? String(pu) : "", descuento: desc, productoId: pid, sugerido: pid, como, conf, duda, estado, ok: estado !== "revisar", ppNuevo: "" };
  });
  rows = facUnir(rows);
  const dup = compras.find((c) => c.origen === "factura" && c.fecha === fecha && norm(c.tienda) === norm(r.tienda) && c.total != null && facNum(r.total) != null && Math.abs(c.total - facNum(r.total)) < 0.01);
  return { tienda: String(r.tienda || "").trim(), fecha, rows, subtotal: facNum(r.subtotal), impuestos: facNum(r.impuestos), descuentos: facNum(r.descuentos), total: facNum(r.total),
    notas: String(r.notas || "").trim(), paginas: fac.pages.length, dup: dup || null, dupOk: false, cid: compraId(), msg: "" };
}
/* Une líneas repetidas del mismo producto (mismo precio) para no duplicar */
function facUnir(rows) {
  const out = [];
  for (const r of rows) {
    const k = r.productoId ? "p:" + r.productoId : "n:" + keyOf(r.nombre);
    const o = out.find((x) => (x.productoId ? "p:" + x.productoId : "n:" + keyOf(x.nombre)) === k && x.precio === r.precio);
    if (o) { o.cantidad += r.cantidad; o.descuento = facR2(o.descuento + r.descuento); if (r.estado === "revisar") { o.estado = "revisar"; o.ok = false; o.duda = o.duda || r.duda; } }
    else out.push(r);
  }
  return out;
}
const facProd = (r) => r.productoId && inventory.find((x) => x.id === r.productoId);
const facPP = (r) => { const p = facProd(r); return p ? ppOf(p, r.codigo) : Math.max(1, parseInt(r.ppNuevo) || 1); };
const facLinea = (r) => { const pu = parseMoney(r.precio); return pu == null ? null : facR2(Math.max(0, pu * r.cantidad - (r.descuento || 0))); };
function facSuma() { let t = 0, any = false; facRev.rows.forEach((r) => { const v = facLinea(r); if (v != null) { t += v; any = true; } }); return any ? facR2(t) : null; }
function facAprender(p, linea) {
  const k = facClave(linea); if (!k) return;
  const a = p.aliasFactura || []; if (!a.includes(k)) p.aliasFactura = [...a, k].slice(-12);
}

/* ---------------- Pantalla: escanear ---------------- */
function renderFactura(v, bar) {
  if (!canWrite) { v.innerHTML = `<section class="card"><div class="notice warn">${icon("alert")}<span>Puedes ver este inventario, pero no cambiarlo.</span></div></section>`; bar.innerHTML = ""; return; }
  const ia = aiState === "ready";
  const busy = fac.state === "busy";
  const n = fac.pages.length;
  v.innerHTML = `${!ia ? `<div class="notice warn">${icon("alert")}<span><b>Para leer facturas se necesita la IA.</b> ${window.CS_DEMO ? "En modo demo está apagada: conecta tu servidor de Vercel (guía de instalación)." : "Revisa que la IA esté configurada en Vercel."} Mientras tanto puedes registrar la compra a mano.</span></div>` : ""}
    <section class="card">
      <div class="fac-add">
        <label class="scan sm fac-btn">${icon("cam")}<div><div class="big">Tomar foto</div><div class="sub">Abre la cámara</div></div>
          <input type="file" id="fcam" accept="image/*" capture="environment" aria-label="Tomar foto de la factura" ${busy ? "disabled" : ""}></label>
        <label class="scan sm fac-btn">${icon("receipt")}<div><div class="big">Fotos o PDF</div><div class="sub">De tu galería o archivos</div></div>
          <input type="file" id="ffile" accept="image/*,application/pdf,.pdf" multiple aria-label="Elegir fotos o PDF de la factura" ${busy ? "disabled" : ""}></label>
      </div>
      <p class="hint" style="margin:0">¿La factura es larga? Toma varias fotos de arriba hacia abajo, una por parte. Ponla sobre una mesa, con buena luz y sin sombras.</p>
    </section>
    ${n ? `<section class="card"><span class="lbl">${plural(n, "página")} de esta factura</span>
      <div class="fac-pages">${fac.pages.map((p, i) => `<div class="fac-pg">
        ${p.tipo === "pdf" ? `<div class="fac-pdf">${icon("receipt")}<b>PDF</b><span>${esc(p.nombre)}</span></div>` : `<img src="${p.thumb}" alt="Página ${i + 1} de la factura">`}
        <span class="fac-n">${i + 1}</span>
        ${busy ? "" : `<button class="xbtn" data-fdel="${p.id}" aria-label="Quitar página ${i + 1}">${icon("close")}</button>`}</div>`).join("")}</div></section>` : ""}
    ${busy ? `<div class="notice ai"><div class="thinking"><i></i><i></i><i></i></div><span>La IA está leyendo tu factura producto por producto… puede tardar hasta un minuto.</span></div>` : ""}
    ${fac.err ? `<div class="notice warn" role="alert">${icon("alert")}<span>${esc(fac.err)}</span></div>` : ""}
    ${!busy ? `<button class="linkbtn" id="fmano">${icon("layers")}Registrar la compra a mano (compra grande)</button>` : ""}`;
  const add = async (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (!fs.length) return; fac.err = ""; fac.state = "idle";
    const st = document.createElement("div"); st.className = "status"; st.textContent = "Preparando las fotos…"; v.prepend(st);
    await facAgregar(fs); render(); };
  $("#fcam").onchange = add; $("#ffile").onchange = add;
  $$("[data-fdel]").forEach((b) => b.onclick = () => { fac.pages = fac.pages.filter((p) => p.id !== b.dataset.fdel); fac.err = ""; fac.state = "idle"; render(); });
  if ($("#fmano")) $("#fmano").onclick = () => { lote = { rows: [], msg: { t: "", err: false } }; tab = "add"; openScreen("lote", "add"); };
  if (busy) {
    bar.innerHTML = `<button class="btn" id="fcancel">${icon("close")}Detener</button><button class="btn primary" disabled>${icon("spark")}Leyendo…</button>`;
    $("#fcancel").onclick = () => fac.ctl && fac.ctl.abort();
  } else {
    bar.innerHTML = `<button class="btn" id="fback">${icon("back")}Salir</button><button class="btn primary" id="fread" ${n && ia ? "" : "disabled"}>${icon("spark")}${fac.state === "err" ? "Intentar otra vez" : "Leer factura"}</button>`;
    $("#fback").onclick = () => { if (n && !$("#fback").dataset.c) { $("#fback").dataset.c = "1"; $("#fback").innerHTML = "¿Salir sin leer?"; return; } closeScreen(); };
    $("#fread").onclick = facLeer;
  }
}

/* ---------------- 4. Confirmación ---------------- */
function facOpciones(r) {
  const sug = r.sugerido && inventory.find((x) => x.id === r.sugerido);
  const otros = [...inventory].filter((x) => x.id !== r.sugerido).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const opt = (p) => `<option value="${p.id}" ${p.id === r.productoId ? "selected" : ""}>${esc(p.nombre)}${p.marca ? " · " + esc(p.marca) : ""}</option>`;
  return `<option value="" ${!r.productoId ? "selected" : ""}>Producto nuevo</option>${sug ? `<optgroup label="Sugerido">${opt(sug)}</optgroup>` : ""}${otros.length ? `<optgroup label="Ya lo tienes en casa">${otros.map(opt).join("")}</optgroup>` : ""}`;
}
function facRowHTML(r) {
  const p = facProd(r), pp = facPP(r), lt = facLinea(r);
  const est = r.estado === "revisar" && !r.ok ? ["warn", "alert", "Revisa este producto"] : p ? ["ok", "check", "Se suma a lo que tienes"] : ["new", "plus", "Producto nuevo"];
  return `<div class="line fac-row ${est[0]}" data-row="${r.key}">
    <div class="top"><span class="fac-st ${est[0]}">${icon(est[1])}${est[2]}</span><button class="xbtn" data-frm="${r.key}" aria-label="Quitar ${esc(r.nombre)}">${icon("close")}</button></div>
    ${r.linea ? `<span class="fac-linea">${esc(r.linea)}</span>` : ""}
    ${r.duda && !r.ok ? `<p class="fac-duda">${icon("alert")}${esc(r.duda)}</p>` : ""}
    <div class="field"><label for="fp-${r.key}">¿Qué producto es?</label><select id="fp-${r.key}" data-fsel="${r.key}">${facOpciones(r)}</select></div>
    ${p ? `<span class="hint">En casa: ${esc(qtyTxt(p))}${pp > 1 ? ` · viene en ${esc(packDesc(p, pp).toLowerCase())}` : ""}</span>`
      : `<div class="field"><label for="fn-${r.key}">Nombre</label><input type="text" id="fn-${r.key}" data-fname="${r.key}" value="${esc(r.nombre)}" placeholder="¿Qué producto es?"></div>
        <div class="row fac-2"><div class="field"><label for="fc-${r.key}">Tipo</label><select id="fc-${r.key}" data-fcat="${r.key}">${CATS.map((c) => `<option ${c === r.categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field"><label for="fu-${r.key}">Cada uno trae <span class="hint">(opcional)</span></label><input type="text" inputmode="numeric" id="fu-${r.key}" data-fpp="${r.key}" value="${esc(r.ppNuevo)}" placeholder="1 unidad"></div></div>`}
    <div class="ctrls"><div class="stepper sm"><button data-fq="-1" data-k="${r.key}" aria-label="Quitar uno">−</button><output>${r.cantidad}</output><button data-fq="1" data-k="${r.key}" aria-label="Agregar uno">+</button></div>
      <div class="price"><span class="hint">$ c/${pp > 1 ? esc(emp(p || { empaque: "Paquete" })) : "u"}</span><input type="text" class="money" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="decimal" data-fpr="${r.key}" value="${esc(r.precio)}" placeholder="Precio" aria-label="Precio de ${esc(r.nombre)}"></div></div>
    <span class="hint" data-flt="${r.key}">${r.descuento ? `Descuento ${money(r.descuento)} · ` : ""}${lt != null ? `Total de la línea ${money(lt)}` : "Sin precio"}${pp > 1 ? ` · ${r.cantidad * pp} ${esc(uni(p || r, r.cantidad * pp))}` : ""}</span>
    ${r.estado === "revisar" && !r.ok ? `<button class="btn sm" data-fok="${r.key}">${icon("check")}Está bien así</button>` : ""}
  </div>`;
}
function facPendientes() { return facRev.rows.filter((r) => !r.ok).length; }
function renderFacRev(v, bar) {
  const R = facRev;
  if (!R) { closeScreen(); return; }
  const suma = facSuma();
  const base = R.subtotal != null ? R.subtotal : R.total != null && R.impuestos != null ? facR2(R.total - R.impuestos) : null;
  const descuadre = suma != null && base != null && Math.abs(suma - base) > Math.max(0.05, base * 0.01);
  const c = { existe: R.rows.filter((r) => facProd(r)).length, nuevo: R.rows.filter((r) => !facProd(r)).length, rev: facPendientes() };
  v.innerHTML = `<section class="card">
      <p class="summary-line">La IA encontró <b>${plural(R.rows.length, "producto")}</b>: ${c.existe} ya en tu casa, ${c.nuevo} ${c.nuevo === 1 ? "nuevo" : "nuevos"}${c.rev ? ` y <b>${c.rev} por revisar</b>` : ""}.</p>
      <div class="row fac-2"><div class="field"><label for="ftienda">Supermercado</label><input type="text" id="ftienda" value="${esc(R.tienda)}" placeholder="Ej.: Costco"></div>
        <div class="field"><label for="ffecha">Fecha</label><input type="date" id="ffecha" value="${R.fecha}" max="${today()}"></div></div>
      ${R.notas ? `<div class="notice ai">${icon("spark")}<span>${esc(R.notas)}</span></div>` : ""}
    </section>
    ${R.dup && !R.dupOk ? `<div class="notice warn" role="alert">${icon("alert")}<span><b>Parece que esta factura ya está guardada</b> (${esc(R.dup.tienda)}, ${fmtDate(R.dup.fecha)}, ${money(R.dup.total)}). Si la guardas otra vez, se sumará dos veces al inventario. <button class="linkbtn" id="fdupok" style="display:inline;padding:0">Es otra compra, seguir</button></span></div>` : ""}
    <div class="inv">${R.rows.map(facRowHTML).join("")}</div>
    ${!R.rows.length ? `<p class="empty">Quitaste todos los productos.</p>` : ""}
    <section class="card"><span class="lbl">${icon("receipt")}Totales de la factura</span>
      <div class="fac-tot">
        <span>Suma de los productos</span><b id="fsuma">${suma != null ? money(suma) : "—"}</b>
        ${R.subtotal != null ? `<span>Subtotal de la factura</span><b>${money(R.subtotal)}</b>` : ""}
        ${R.descuentos ? `<span>Descuentos</span><b>−${money(R.descuentos)}</b>` : ""}
        ${R.impuestos != null ? `<span>Impuestos</span><b>${money(R.impuestos)}</b>` : ""}
      </div>
      <div class="total"><span>Total pagado</span><b>${R.total != null ? money(R.total) : suma != null ? money(suma) : "—"}</b></div>
      <div id="fdesc">${descuadre ? `<div class="notice warn">${icon("alert")}<span>La suma de los productos (${money(suma)}) no coincide con la factura (${money(base)}). Revisa cantidades y precios, o si falta algún producto.</span></div>` : ""}</div>
    </section>
    ${R.msg ? `<div class="notice warn" role="alert">${icon("alert")}<span>${esc(R.msg)}</span></div>` : ""}`;
  const row = (k) => R.rows.find((x) => x.key === k);
  $("#ftienda").oninput = (e) => { R.tienda = e.target.value; };
  $("#ffecha").onchange = (e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) R.fecha = e.target.value; };
  if ($("#fdupok")) $("#fdupok").onclick = () => { R.dupOk = true; render(); };
  $$("[data-frm]").forEach((b) => b.onclick = () => { R.rows = R.rows.filter((x) => x.key !== b.dataset.frm); render(); });
  $$("[data-fok]").forEach((b) => b.onclick = () => { const r = row(b.dataset.fok); if (r) { r.ok = true; render(); } });
  $$("[data-fsel]").forEach((s) => s.onchange = (e) => { const r = row(s.dataset.fsel); if (!r) return; r.productoId = e.target.value; r.ok = true; render(); });
  $$("[data-fname]").forEach((i) => i.oninput = (e) => { const r = row(i.dataset.fname); if (r) { r.nombre = e.target.value; facBarra(); } });
  $$("[data-fcat]").forEach((s) => s.onchange = (e) => { const r = row(s.dataset.fcat); if (r) r.categoria = e.target.value; });
  $$("[data-fpp]").forEach((i) => i.oninput = (e) => { const r = row(i.dataset.fpp); if (r) { r.ppNuevo = e.target.value.replace(/\D/g, ""); facLineaTxt(r); } });
  $$("[data-fq]").forEach((b) => b.onclick = () => { const r = row(b.dataset.k); if (!r) return; r.cantidad = Math.max(1, r.cantidad + (+b.dataset.fq)); b.parentElement.querySelector("output").textContent = r.cantidad; facLineaTxt(r); facTotales(); });
  $$("[data-fpr]").forEach((i) => i.oninput = (e) => { const r = row(i.dataset.fpr); if (r) { r.precio = e.target.value; facLineaTxt(r); facTotales(); } });
  bar.innerHTML = `<button class="btn" id="fbk">${icon("back")}Atrás</button><button class="btn primary" id="fsave">${icon("check")}Guardar compra</button>`;
  $("#fbk").onclick = () => { if (!$("#fbk").dataset.c) { $("#fbk").dataset.c = "1"; $("#fbk").innerHTML = "¿Descartar lo leído?"; return; } facRev = null; screen = "factura"; render(); scrollTo(0, 0); };
  $("#fsave").onclick = saveFac;
  facBarra();
}
function facLineaTxt(r) {
  const el = document.querySelector(`[data-flt="${r.key}"]`); if (!el) return;
  const p = facProd(r), pp = facPP(r), lt = facLinea(r);
  el.textContent = `${r.descuento ? `Descuento ${money(r.descuento)} · ` : ""}${lt != null ? `Total de la línea ${money(lt)}` : "Sin precio"}${pp > 1 ? ` · ${r.cantidad * pp} ${uni(p || r, r.cantidad * pp)}` : ""}`;
}
function facTotales() { const s = facSuma(); const el = $("#fsuma"); if (el) el.textContent = s != null ? money(s) : "—"; }
function facBarra() {
  const b = $("#fsave"); if (!b || !facRev) return;
  const R = facRev, pend = facPendientes(), sinNombre = R.rows.some((r) => !facProd(r) && !String(r.nombre || "").trim());
  const n = R.rows.reduce((a, r) => a + r.cantidad, 0);
  b.disabled = saving || !R.rows.length || pend > 0 || sinNombre || (R.dup && !R.dupOk);
  b.innerHTML = `${icon("check")}${saving ? "Guardando…" : pend ? `Revisa ${plural(pend, "producto")}` : sinNombre ? "Falta un nombre" : `Guardar ${plural(n, "producto")}`}`;
}

/* ---------------- Guardar: inventario + historial ---------------- */
async function saveFac() {
  const R = facRev;
  if (saving || !R || !R.rows.length || facPendientes() || (R.dup && !R.dupOk)) return;
  saving = true; R.msg = ""; facBarra();
  const f = R.fecha || today(), tienda = R.tienda.trim(), cid = R.cid;
  // Agrupa por producto destino: cada producto se escribe una sola vez (sin duplicados)
  const grupos = new Map();
  for (const r of R.rows) {
    let base = facProd(r) || null;
    if (!base) base = (r.codigo && inventory.find((p) => p.codigo === r.codigo || (p.paquetes && p.paquetes[r.codigo]))) || localMatch(r.nombre, false) || null;
    const k = base ? base.id : "n:" + keyOf(r.nombre);
    if (!grupos.has(k)) {
      let p, nuevo = false;
      if (base) p = JSON.parse(JSON.stringify(base));
      else {
        p = newProduct({ nombre: cap(r.nombre.trim()), marca: r.marca, tamano: r.tamano, categoria: r.categoria, codigo: r.codigo });
        const pp = Math.max(1, parseInt(r.ppNuevo) || 1);
        if (pp > 1) setPack(p, { code: r.codigo, pp, empaque: "Paquete", principal: true });
        nuevo = true;
      }
      grupos.set(k, { p, nuevo, rows: [] });
    }
    grupos.get(k).rows.push(r);
  }
  const items = [];
  const writes = [];
  let count = 0, nuevos = 0;
  for (const g of grupos.values()) {
    let p = g.p;
    for (const r of g.rows) {
      const pp = ppOf(p, r.codigo), pu = parseMoney(r.precio), lt = facLinea(r);
      const precioU = lt != null ? Math.round(lt / (r.cantidad * pp) * 10000) / 10000 : null;   // lo que de verdad costó cada unidad
      if (!r.guardado) { p = applyPurchase(p, { n: r.cantidad * pp, f, precio: precioU, tienda, pq: r.cantidad, pp, cid }); facAprender(p, r.linea); }
      items.push({ productoId: p.id, nombre: p.nombre, linea: r.linea || "", cantidad: r.cantidad, unidades: r.cantidad * pp, precioUnitario: pu, descuento: r.descuento || 0, total: lt, nuevo: g.nuevo || undefined });
      count += r.cantidad;
    }
    if (g.nuevo) nuevos++;
    const pend = g.rows.filter((r) => !r.guardado);
    if (pend.length) writes.push(saveP(p).then(() => pend.forEach((r) => { r.guardado = true; r.productoId = p.id; })));
    // Lo que estaba en la lista y ya se compró sale de la lista
    const enLista = lista.filter((x) => x.productoId === p.id || (!x.productoId && norm(x.nombre) === norm(p.nombre)));
    enLista.forEach((x) => writes.push(store.del("lista", x.id).catch(() => {})));
  }
  const suma = items.reduce((a, it) => a + (it.total || 0), 0);
  const resultados = await Promise.allSettled(writes);
  const fallo = resultados.find((x) => x.status === "rejected");
  if (fallo) {
    saving = false; R.msg = "No se pudo guardar todo. Revisa tu conexión y toca Guardar otra vez: lo que ya se guardó no se repite.";
    writeErr(fallo.reason); render(); return;
  }
  try {
    await guardarCompra(cid, { fecha: f, tienda, origen: "factura", items, paginas: R.paginas, subtotal: R.subtotal, impuestos: R.impuestos, descuentos: R.descuentos,
      total: R.total != null ? R.total : facR2(suma) });
  } catch (e) { saving = false; R.msg = "Los productos ya se sumaron, pero no se pudo guardar el historial. Toca Guardar otra vez."; writeErr(e); render(); return; }
  saving = false;
  done = { count, total: R.total != null ? R.total : facR2(suma) || null, origen: "factura", compraId: cid, nuevos };
  facRev = null; fac = { pages: [], state: "idle", err: "", from: fac.from, ctl: null };
  screen = "hecho"; render(); scrollTo(0, 0);
}

/* ---------------- 5 y 6. Historial de compras y análisis de gastos ---------------- */
const HIST_PER = [["mes", "Este mes"], ["3m", "3 meses"], ["ano", "Este año"], ["todo", "Todo"]];
function histDesde() {
  const d = new Date();
  if (histPer === "mes") return today().slice(0, 8) + "01";
  if (histPer === "3m") { d.setMonth(d.getMonth() - 3); return localISO(d); }
  if (histPer === "ano") return today().slice(0, 4) + "-01-01";
  return "0000";
}
/* Gastos: compras guardadas (con impuestos) + compras sueltas del historial de cada producto (sin compra asociada) */
function histGastos() {
  const out = [];
  compras.forEach((c) => { const t = c.total != null ? c.total : (c.items || []).reduce((a, i) => a + (i.total || 0), 0); if (t > 0 && c.fecha) out.push({ f: c.fecha, v: t, s: c.tienda || "" }); });
  inventory.forEach((p) => (p.historial || []).forEach((h) => { if (h.t === "c" && h.p != null && !h.cid && h.f) out.push({ f: h.f, v: h.p * h.n, s: h.s || "" }); }));
  return out;
}
const lunes = (iso) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localISO(d); };
function histStats() {
  const desde = histDesde(), G = histGastos();
  const enPer = G.filter((g) => g.f >= desde);
  const total = enPer.reduce((a, g) => a + g.v, 0);
  // Semanal: últimas 8 semanas. Mensual: últimos 6 meses.
  const sem = []; let l = lunes(today());
  for (let i = 0; i < 8; i++) { sem.unshift({ k: l, v: 0 }); const d = new Date(l + "T12:00:00"); d.setDate(d.getDate() - 7); l = localISO(d); }
  const mes = []; const d0 = new Date(); d0.setDate(1);
  for (let i = 0; i < 6; i++) { mes.unshift({ k: localISO(d0).slice(0, 7), v: 0 }); d0.setMonth(d0.getMonth() - 1); }
  G.forEach((g) => { const s = sem.find((x) => x.k === lunes(g.f)); if (s) s.v += g.v; const m = mes.find((x) => x.k === g.f.slice(0, 7)); if (m) m.v += g.v; });
  const tiendas = {}; enPer.forEach((g) => { const s = g.s || "Sin tienda"; tiendas[s] = (tiendas[s] || 0) + g.v; });
  // Productos: más comprados, variación de precio y comparación entre tiendas (precio por unidad)
  const mas = [], vari = [], comp = [];
  inventory.forEach((p) => {
    const buys = (p.historial || []).filter((h) => h.t === "c");
    const per = buys.filter((h) => h.f >= desde);
    if (per.length) mas.push({ p, veces: per.length, unidades: per.reduce((a, h) => a + (h.n || 0), 0) });
    const pr = buys.filter((h) => h.p != null && h.p > 0);
    if (pr.length > 1) { const a = pr[0].p, b = pr[pr.length - 1].p; const pct = (b - a) / a * 100; if (Math.abs(pct) >= 3) vari.push({ p, a, b, pct }); }
    const porT = {}; pr.forEach((h) => { if (h.s) porT[h.s] = h.p; });
    const ts = Object.entries(porT).sort((x, y) => x[1] - y[1]);
    if (ts.length > 1) comp.push({ p, barata: ts[0], cara: ts[ts.length - 1], pct: (ts[ts.length - 1][1] - ts[0][1]) / ts[0][1] * 100 });
  });
  mas.sort((a, b) => b.veces - a.veces || b.unidades - a.unidades);
  vari.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  comp.sort((a, b) => b.pct - a.pct);
  return { total, n: enPer.length, sem, mes, tiendas: Object.entries(tiendas).sort((a, b) => b[1] - a[1]), mas: mas.slice(0, 8), vari: vari.slice(0, 6), comp: comp.slice(0, 6), any: G.length > 0 };
}
function histBarras(arr, lab) {
  const max = Math.max(...arr.map((x) => x[1]), 0.01);
  return `<div class="bars">${arr.map(([k, v]) => `<div class="barrow"><span>${esc(lab ? lab(k) : k)}</span><div class="track"><div class="fill" style="width:${v ? Math.max(4, v / max * 100) : 0}%"></div></div><span class="v">${v ? money(facR2(v)) : "—"}</span></div>`).join("")}</div>`;
}
const ORIGEN = { factura: "Factura", lote: "Compra grande", lista: "Lista de compras" };
function renderHist(v, bar) {
  if (!loaded) { v.innerHTML = `<div class="loading"><div class="thinking"><i></i><i></i><i></i></div>Cargando tus compras…</div>`; bar.innerHTML = ""; return; }
  const S = histStats();
  const lista_ = [...compras].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || 0) - (a.creado || 0));
  const desde = histDesde();
  const visibles = lista_.filter((c) => (c.fecha || "") >= desde);
  const fmtSem = (k) => { const [, m, d] = k.split("-"); return `${+d} ${MES[m - 1].slice(0, 3)}`; };
  const fmtMes = (k) => cap0(MES[+k.slice(5, 7) - 1]);
  v.innerHTML = `<div class="chips" role="group" aria-label="Periodo">${HIST_PER.map(([k, l]) => `<button class="chip sm" data-per="${k}" aria-pressed="${histPer === k}">${l}</button>`).join("")}</div>
    ${!S.any ? `<section class="card done-card"><div class="ring">${icon("receipt")}</div><h3>Todavía no hay compras con precio</h3><p class="lead">Escanea una factura o escribe el precio al registrar tus compras y aquí verás tus gastos.</p>
      ${canWrite ? `<button class="btn primary" id="hfac">${icon("receipt")}Escanear factura</button>` : ""}</section>` : `
    <section class="card"><span class="aitag g">${icon("money")}Gastado</span>
      <div><div class="big-num">${money(facR2(S.total))}</div><p class="lead">${HIST_PER.find((x) => x[0] === histPer)[1].toLowerCase()}${S.n ? ` · ${plural(S.n, "compra")}` : ""}</p></div></section>
    <section class="card"><span class="lbl">Por semana</span>${histBarras(S.sem.map((x) => [x.k, x.v]), fmtSem)}</section>
    <section class="card"><span class="lbl">Por mes</span>${histBarras(S.mes.map((x) => [x.k, x.v]), fmtMes)}</section>
    ${S.tiendas.length ? `<section class="card"><span class="lbl">Por supermercado</span>${histBarras(S.tiendas.slice(0, 8))}</section>` : ""}
    ${S.mas.length ? `<section class="card"><span class="lbl">${icon("cart")}Lo que más compras</span><ul class="list">${S.mas.map((m) => `<li><span class="num">${m.veces}</span><div><b>${esc(m.p.nombre)}</b><span>${plural(m.veces, "compra")} · ${esc(qtyTxt(m.p, m.unidades))}${m.p.unidad ? "" : " en total"}</span></div></li>`).join("")}</ul></section>` : ""}
    ${S.vari.length ? `<section class="card"><span class="lbl">Cambios de precio</span><ul class="list">${S.vari.map((x) => `<li><span class="ico ${x.pct > 0 ? "w" : "g"}">${icon(x.pct > 0 ? "up" : "dn")}</span><div><b>${esc(x.p.nombre)}</b><span>De ${money(x.a)} a ${money(x.b)} por ${esc(uni(x.p, 1))} (${x.pct > 0 ? "+" : ""}${Math.round(x.pct)} %)</span></div></li>`).join("")}</ul></section>` : ""}
    ${S.comp.length ? `<section class="card"><span class="lbl">Dónde sale más barato</span><ul class="list">${S.comp.map((x) => `<li><span class="ico g">${icon("money")}</span><div><b>${esc(x.p.nombre)}</b><span>${esc(x.barata[0])} ${money(x.barata[1])} · ${esc(x.cara[0])} ${money(x.cara[1])} por ${esc(uni(x.p, 1))} (${Math.round(x.pct)} % más)</span></div></li>`).join("")}</ul></section>` : ""}`}
    <div class="field"><span class="lbl">${icon("list")}Compras guardadas</span>
      ${visibles.length ? `<div class="inv">${visibles.map((c) => {
        const t = c.total != null ? c.total : (c.items || []).reduce((a, i) => a + (i.total || 0), 0);
        return `<details class="fac-hist"><summary><span><b>${esc(c.tienda || "Sin tienda")}</b><span class="hint">${fmtDate(c.fecha)} · ${plural((c.items || []).length, "producto")} · ${ORIGEN[c.origen] || "Compra"}</span></span><b class="fac-ht">${t ? money(facR2(t)) : "—"}</b></summary>
          <ul class="fac-items">${(c.items || []).map((i) => `<li><span>${esc(i.nombre)}${i.cantidad > 1 ? ` ×${i.cantidad}` : ""}${i.linea ? `<small>${esc(i.linea)}</small>` : ""}</span><b>${i.total != null ? money(i.total) : ""}</b></li>`).join("")}</ul>
          ${c.impuestos != null || c.descuentos ? `<p class="hint" style="margin:0">${c.descuentos ? `Descuentos ${money(c.descuentos)}` : ""}${c.descuentos && c.impuestos != null ? " · " : ""}${c.impuestos != null ? `Impuestos ${money(c.impuestos)}` : ""}</p>` : ""}
          ${canWrite ? `<button class="linkbtn danger" data-hdel="${c.id}">${icon("trash")}${histBorrar === c.id ? "Toca otra vez para borrar (tu inventario no cambia)" : "Borrar del historial"}</button>` : ""}</details>`; }).join("")}</div>`
        : `<p class="empty">${lista_.length ? "No hay compras guardadas en este periodo." : "Aún no hay compras guardadas. Aparecen aquí al escanear una factura o al terminar una compra grande o tu lista."}</p>`}</div>`;
  $$("[data-per]").forEach((b) => b.onclick = () => { histPer = b.dataset.per; render(); });
  if ($("#hfac")) $("#hfac").onclick = () => abrirFactura(screenTab);
  $$("[data-hdel]").forEach((b) => b.onclick = async (e) => { e.preventDefault(); const id = b.dataset.hdel;
    if (histBorrar !== id) { histBorrar = id; b.innerHTML = `${icon("trash")}Toca otra vez para borrar (tu inventario no cambia)`; return; }
    histBorrar = null; try { await store.del("compras", id); toast("Compra borrada del historial"); } catch (err) { writeErr(err); } });
  bar.innerHTML = `<button class="btn" id="hback">${icon("back")}Atrás</button>${canWrite ? `<button class="btn primary" id="hnew">${icon("receipt")}Escanear factura</button>` : ""}`;
  $("#hback").onclick = closeScreen;
  if ($("#hnew")) $("#hnew").onclick = () => abrirFactura(screenTab);
}
