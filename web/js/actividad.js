/* Casita Stock — Actividad familiar y avisos entre la familia (desde 2.5).
   - Cada compra, producto nuevo, cambio de cantidad o producto borrado se registra DESPUÉS de guardarse
     (store.set/del llaman a Actividad.trasGuardar). Con Supabase va a la tabla "actividad" (RLS por casa);
     sin conexión entra en la misma cola que el cambio y se sube detrás de él. El id lo pone la app: no se duplica.
   - Las compras de un mismo lote (factura, lista, supermercado) son un solo evento: "c-" + id de la compra.
   - Avisos dentro de la app en tiempo real cuando OTRA persona compra; centro "Actividad familiar" con no leídos.
   - Preparado para avisos push (APNs) en una segunda etapa: ver docs/PUSH-APNS.md. Hoy no se envía nada fuera de la app.
   Usa db, mode, me, users, inventory, lista, qtyTxt, esc, icon, toast, uid, today, render, tab, screen de app.js. */
const Actividad = (() => {
  const DEMO = "cs-actividad-demo";
  let filas = [], cargado = false, buffer = [], timer = null, nombres = {}, miNombre = "", sesion = Date.now(), cola = [], mostrando = false;
  const k = (s) => `cs-act-${s}-${me || "yo"}`;
  const leerLS = (key, d) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  const ponerLS = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };
  const cfg = () => ({ avisos: true, ...leerLS(k("cfg"), {}) });
  const back = () => (mode === "db" && db && db.actividad ? db.actividad : null);
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const cuando = (r) => (r.data && r.data.cuando) || Date.parse(r.creado) || Date.now();
  const mio = (r) => !r.user_id || r.user_id === me;
  const cant = (t) => { t = String(t || "").trim(); return !t || t === "0" ? "" : /^\d+(?:[.,]\d+)?$/.test(t) ? "×" + t : t; };
  const autor = (r) => (mio(r) ? "Tú" : r.autor || nombres[r.user_id] || "Alguien de la casa");

  async function quienSoy() {
    if (miNombre) return miNombre;
    try { miNombre = users ? (await users.name()) || "" : ""; } catch (e) {}
    return miNombre;
  }

  /* ---------- Registrar (solo después de guardar) ---------- */
  async function registrar(tipo, data, deps = [], id = nuevoId()) {
    if (filas.some((f) => f.id === id)) return;
    const row = { id, tipo, autor: await quienSoy(), data: { ...data, cuando: data.cuando || Date.now() } };
    filas.unshift({ ...row, user_id: me, creado: new Date().toISOString(), pendiente: true });
    const b = back();
    if (b) { try { await b.registrar(row, deps); } catch (e) {} }
    else if (mode !== "db") { const a = leerLS(DEMO, []); if (!a.some((x) => x.id === id)) { a.unshift({ ...row, user_id: me, creado: new Date().toISOString() }); ponerLS(DEMO, a.slice(0, 200)); } }
    cambio();
  }
  const itemDe = (p, unidades, pq) => ({ productoId: p.id, nombre: p.nombre, unidades, texto: typeof qtyTxt === "function" ? qtyTxt(p, unidades) : String(unidades) });
  function encolarCompra(it, extra) {
    buffer.push({ it, extra }); clearTimeout(timer);
    timer = setTimeout(() => { const b = buffer; buffer = []; if (!b.length) return;
      registrar("compra", { items: b.map((x) => x.it), tienda: b.find((x) => x.extra.tienda)?.extra.tienda || "", fecha: b[0].extra.fecha || today() }, b.map((x) => "productos/" + x.it.productoId)); }, 1200);
  }
  const claveH = (h) => JSON.stringify([h.t, h.n, h.f, h.u || "", h.cid || "", h.s || ""]);
  /* Llamada por store.set/del de app.js cuando el cambio ya se guardó */
  function trasGuardar(col, id, prev, body) {
    try {
      if (col === "compras" && body && body.items && body.items.length) {
        const items = body.items.map((x) => { const p = inventory.find((q) => q.id === x.productoId); return { productoId: x.productoId, nombre: x.nombre, unidades: x.unidades || x.cantidad, texto: p ? qtyTxt(p, x.unidades || x.cantidad) : String(x.cantidad) }; });
        return registrar("compra", { items, tienda: body.tienda || "", fecha: body.fecha || today(), compraId: id, total: body.total || null }, ["compras/" + id], "c-" + id);
      }
      if (col !== "productos") return;
      const p = body || prev; if (!p || p.ejemplo) return;
      if (!body) return registrar("eliminar", { producto: { id, nombre: prev.nombre } }, []);
      const vistos = new Set(((prev && prev.historial) || []).map(claveH));
      const nuevos = (body.historial || []).filter((h) => !vistos.has(claveH(h)));
      const compra = nuevos.find((h) => h.t === "c");
      if (compra && compra.cid) return;                       // es parte de un lote: lo cuenta el evento de la compra
      if (compra) return encolarCompra(itemDe(body, compra.n, compra.pq), { tienda: compra.s, fecha: compra.f });
      if (!prev) return registrar("agregar", { producto: { id, nombre: body.nombre }, texto: qtyTxt(body, body.cantidad || 0) }, ["productos/" + id]);
      const uso = nuevos.find((h) => h.t === "u");
      if (uso) return registrar("uso", { producto: { id, nombre: body.nombre }, texto: qtyTxt(body, uso.n) }, ["productos/" + id]);
      if (+prev.cantidad !== +body.cantidad) return registrar("cantidad", { producto: { id, nombre: body.nombre }, de: qtyTxt(body, prev.cantidad || 0), a: qtyTxt(body, body.cantidad || 0) }, ["productos/" + id]);
    } catch (e) { console.error("[Casita Stock] actividad:", e && e.message); }
  }

  /* ---------- Cargar y recibir ---------- */
  async function recargar() {
    const b = back(); let nuevas = [];
    try { nuevas = b ? await b.listar(100) : leerLS(DEMO, []); } catch (e) { return; }
    const ids = new Set(filas.filter((f) => !f.pendiente).map((f) => f.id));
    filas = [...nuevas, ...filas.filter((f) => f.pendiente && !nuevas.some((n) => n.id === f.id))];
    filas.sort((a, b2) => cuando(b2) - cuando(a));
    cargado = true;
    await cargarNombres();
    // Al reconectar: avisar solo lo de otros que llegó durante esta sesión y que no se avisó antes
    filas.filter((f) => !ids.has(f.id) && !mio(f) && Date.parse(f.creado) >= sesion - 120000).forEach(avisar);
    cambio();
  }
  async function cargarNombres() {
    const faltan = [...new Set(filas.map((f) => f.user_id).filter((u) => u && !nombres[u]))];
    if (!faltan.length || !users || !users.profiles) return;
    try { const r = await users.profiles(faltan); for (const u of faltan) if (r[u] && r[u].name) nombres[u] = r[u].name; } catch (e) {}
  }
  function recibir(row) {
    if (!row || !row.id || filas.some((f) => f.id === row.id && !f.pendiente)) return;
    filas = [row, ...filas.filter((f) => f.id !== row.id)];
    if (!mio(row)) avisar(row);
    cambio();
  }

  /* ---------- Avisos dentro de la app ---------- */
  function avisar(row) {
    if (row.tipo !== "compra" || mio(row) || !cfg().avisos) return;
    const ya = new Set(leerLS(k("avisadas"), []));
    if (ya.has(row.id)) return;
    ya.add(row.id); ponerLS(k("avisadas"), [...ya].slice(-300));
    cola.push(row); if (!mostrando) siguiente();
  }
  function siguiente() {
    const row = cola.shift(); if (!row) { mostrando = false; return; }
    mostrando = true;
    let h = document.getElementById("fam-aviso");
    if (!h) { h = document.createElement("div"); h.id = "fam-aviso"; h.setAttribute("role", "status"); h.setAttribute("aria-live", "polite"); document.body.append(h); }
    const it = (row.data && row.data.items) || [];
    h.innerHTML = `<button class="fa-card" id="fa-ver"><span class="fa-ico">${icon("cart")}</span><span class="fa-tx"><b>${esc(autor(row))} realizó una compra${row.data.tienda ? " en " + esc(row.data.tienda) : ""}</b>
      <span>${it.slice(0, 3).map((x) => esc(x.nombre + (cant(x.texto) ? ` (${cant(x.texto)})` : ""))).join(" · ")}${it.length > 3 ? ` y ${it.length - 3} más` : ""}</span>
      <small>Ya está en el inventario de la casa</small></span></button><button class="fa-x" id="fa-x" aria-label="Cerrar aviso">${icon("close")}</button>`;
    h.className = "fam-aviso on";
    const cerrar = () => { h.className = "fam-aviso"; clearTimeout(h._t); setTimeout(siguiente, 300); };
    h.querySelector("#fa-ver").onclick = () => { cerrar(); abrir(row.id); };
    h.querySelector("#fa-x").onclick = cerrar;
    clearTimeout(h._t); h._t = setTimeout(cerrar, 9000);
  }

  /* ---------- Leídos ---------- */
  const leido = () => leerLS(k("leido"), { hasta: 0, ids: [] });
  const noLeida = (r) => !mio(r) && cuando(r) > leido().hasta && !leido().ids.includes(r.id);
  const pendientes = () => filas.filter(noLeida).length;
  function marcarLeida(id) { const l = leido(); if (!l.ids.includes(id)) { l.ids = [...l.ids, id].slice(-300); ponerLS(k("leido"), l); } cambio(); }
  function marcarTodo() { ponerLS(k("leido"), { hasta: Date.now(), ids: [] }); cambio(); }
  function cambio() {
    const n = pendientes(), b = document.getElementById("famn");
    if (b) { b.textContent = n > 9 ? "9+" : String(n); b.hidden = !n; }
    const btn = document.getElementById("famact"); if (btn) btn.setAttribute("aria-label", n ? `Actividad familiar, ${n} sin leer` : "Actividad familiar");
    if (document.getElementById("fam-host")?.innerHTML) pintar();
    window.dispatchEvent(new CustomEvent("cs-actividad-cambio", { detail: n }));
  }

  /* ---------- Textos ---------- */
  function frase(r) {
    const d = r.data || {}, q = autor(r), yo = mio(r);
    if (r.tipo === "compra") { const n = (d.items || []).length; return `${q} ${yo ? "registraste" : "registró"} una compra${n > 1 ? ` de ${n} productos` : n === 1 ? `: ${d.items[0].nombre}` : ""}${d.tienda ? ` en ${d.tienda}` : ""}`; }
    const nom = d.producto ? d.producto.nombre : "un producto";
    if (r.tipo === "agregar") return `${q} ${yo ? "agregaste" : "agregó"} ${nom} al inventario${cant(d.texto) ? ` (${cant(d.texto)})` : ""}`;
    if (r.tipo === "uso") return `${q} ${yo ? "usaste" : "usó"} ${d.texto || ""} de ${nom}`.replace(/\s+/g, " ");
    if (r.tipo === "cantidad") return `${q} ${yo ? "cambiaste" : "cambió"} ${nom}: ${d.de} → ${d.a}`;
    if (r.tipo === "eliminar") return `${q} ${yo ? "borraste" : "borró"} ${nom} del inventario`;
    return `${q} hizo un cambio`;
  }
  const hora = (t) => new Date(t).toLocaleTimeString("es-US", { hour: "numeric", minute: "2-digit" });
  function diaDe(t) { const d = new Date(t), h = new Date(), a = new Date(); a.setDate(h.getDate() - 1);
    return d.toDateString() === h.toDateString() ? "Hoy" : d.toDateString() === a.toDateString() ? "Ayer" : d.toLocaleDateString("es-US", { weekday: "long", day: "numeric", month: "long" }); }
  const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `el ${new Date(t).toLocaleDateString("es-US", { day: "numeric", month: "short" })}`; };

  /* ---------- Pantalla "Actividad familiar" ---------- */
  let filtro = "todo", abierta = null;
  const host = () => { let h = document.getElementById("fam-host"); if (!h) { h = document.createElement("div"); h.id = "fam-host"; document.body.append(h); } return h; };
  function filaHTML(r) {
    const d = r.data || {}, nl = noLeida(r), ab = abierta === r.id, ini = autor(r).charAt(0).toUpperCase();
    return `<li class="fam-it${nl ? " nueva" : ""}"><button class="fam-b" data-fa="${esc(r.id)}" aria-expanded="${ab}">
      <span class="fam-av t-${esc(r.tipo)}" aria-hidden="true">${r.tipo === "compra" ? icon("cart") : esc(ini)}</span>
      <span class="fam-tx"><span>${esc(frase(r))}</span><small>${hora(cuando(r))}${r.pendiente && !navigator.onLine ? " · sin subir" : ""}</small></span>
      ${nl ? `<span class="fam-dot" aria-label="Nueva"></span>` : ""}</button>
      ${ab && r.tipo === "compra" ? `<ul class="fam-items">${(d.items || []).map((x) => `<li><span>${esc(x.nombre)}</span><b>${esc(cant(x.texto))}</b></li>`).join("")}</ul>
        <p class="hint" style="margin:4px 0 0 54px">${d.fecha ? "Compra del " + esc(new Date(d.fecha + "T12:00").toLocaleDateString("es-US", { day: "numeric", month: "long" })) : ""}${d.total ? " · " + money(d.total) : ""}</p>` : ""}</li>`;
  }
  function htmlLista() {
    const fs = filas.filter((r) => filtro === "todo" || (filtro === "compras" ? r.tipo === "compra" : r.tipo !== "compra"));
    if (!cargado) return `<p class="lead">Cargando…</p>`;
    if (!fs.length) return `<div class="mem-vacio">Todavía no hay actividad. Aquí verás quién compra, agrega, usa o borra productos en la casa.</div>`;
    const grupos = []; for (const r of fs) { const d = diaDe(cuando(r)); let g = grupos.find((x) => x.d === d); if (!g) grupos.push(g = { d, rs: [] }); g.rs.push(r); }
    return grupos.map((g) => `<section class="fam-g"><h3>${esc(g.d.charAt(0).toUpperCase() + g.d.slice(1))}</h3><ul class="fam-l">${g.rs.map(filaHTML).join("")}</ul></section>`).join("");
  }
  function pintar() {
    const h = host(), sc = h.querySelector(".sheet"), y = sc ? sc.scrollTop : 0, n = pendientes(), c = cfg();
    const sinTabla = back() && back().sinTabla && back().sinTabla();
    h.innerHTML = `<div class="sheet-wrap" id="fam-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fam-t">
      <div class="grab" aria-hidden="true"></div>
      <div class="top"><h2 id="fam-t">Actividad familiar</h2><button class="x" id="fam-x" aria-label="Cerrar">${icon("close")}</button></div>
      ${sinTabla ? `<div class="notice warn">${icon("alert")}<span><b>Falta un paso en Supabase.</b> Pega <b>supabase/actividad-familiar.sql</b> en el SQL Editor para compartir la actividad con tu familia.</span></div>` : ""}
      <div class="fam-bar"><div class="chips" role="radiogroup" aria-label="Mostrar">${[["todo", "Todo"], ["compras", "Compras"], ["cambios", "Cambios"]].map(([v, t]) => `<button class="chip" role="radio" data-ff="${v}" aria-checked="${filtro === v}">${t}</button>`).join("")}</div>
        ${n ? `<button class="linkbtn" id="fam-leer">Marcar ${n === 1 ? "como leída" : `las ${n} como leídas`}</button>` : ""}</div>
      ${htmlLista()}
      <button class="check" id="fam-avisos" aria-pressed="${c.avisos}"><span class="box">${icon("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Avisarme cuando alguien de la casa compra</span><br><span class="cm">Mientras Casita Stock está abierta. Solo en este teléfono.</span></span><span></span></button>
    </div></div>`;
    const s = h.querySelector(".sheet"); if (s) s.scrollTop = y;
    const $f = (q) => h.querySelector(q);
    const cerrar = () => { h.innerHTML = ""; abierta = null; if (!document.querySelector(".sheet-wrap")) document.body.classList.remove("noscroll"); };
    $f("#fam-x").onclick = cerrar; $f("#fam-scrim").onclick = (e) => { if (e.target.id === "fam-scrim") cerrar(); };
    h.querySelectorAll("[data-ff]").forEach((b) => b.onclick = () => { filtro = b.dataset.ff; pintar(); });
    h.querySelectorAll("[data-fa]").forEach((b) => b.onclick = () => { const id = b.dataset.fa; abierta = abierta === id ? null : id; marcarLeida(id); pintar(); });
    if ($f("#fam-leer")) $f("#fam-leer").onclick = marcarTodo;
    $f("#fam-avisos").onclick = () => { ponerLS(k("cfg"), { ...cfg(), avisos: !cfg().avisos }); toast(cfg().avisos ? "Te aviso cuando alguien compre" : "Avisos de la familia en silencio"); pintar(); };
  }
  function abrir(id) { document.body.classList.add("noscroll"); abierta = id || null; if (id) marcarLeida(id); pintar(); if (!cargado) recargar(); }

  /* ---------- Evitar compras repetidas ---------- */
  function compradoPorOtro(p, horas = 24) {
    const lim = Date.now() - horas * 3600000;
    for (const r of filas) {
      if (r.tipo !== "compra" || mio(r) || cuando(r) < lim) continue;
      const it = (r.data.items || []).find((x) => (p.id && x.productoId === p.id) || norm(x.nombre) === norm(p.nombre || ""));
      if (it) return { autor: autor(r), cuando: cuando(r), texto: it.texto, tienda: r.data.tienda || "" };
    }
    return null;
  }
  const yaHTML = (p) => { const c = compradoPorOtro(p); return c ? `<span class="ya-comp">${icon("alert")}${esc(c.autor)} lo compró ${hace(c.cuando)}${cant(c.texto) ? ` (${esc(cant(c.texto))})` : ""}</span>` : ""; };
  function avisarRepetido(p) { const c = compradoPorOtro(p); if (c) toast(`${c.autor} compró ${p.nombre} ${hace(c.cuando)}${cant(c.texto) ? ` (${cant(c.texto)})` : ""}. Si igual lo necesitas, sigue.`); }
  /* Tarjeta para la lista: lo que la familia compró hoy */
  function compradoHoyHTML() {
    const hoy = new Date().toDateString();
    const rs = filas.filter((r) => r.tipo === "compra" && !mio(r) && new Date(cuando(r)).toDateString() === hoy);
    if (!rs.length) return "";
    return `<section class="card fam-hoy"><span class="aitag g">${icon("users")}Ya comprado hoy por la familia</span>
      <ul>${rs.flatMap((r) => (r.data.items || []).map((x) => `<li><span>${esc(x.nombre)}${cant(x.texto) ? ` <small>${esc(cant(x.texto))}</small>` : ""}</span><small>${esc(autor(r))} · ${hora(cuando(r))}</small></li>`)).slice(0, 8).join("")}</ul>
      <button class="linkbtn" id="fam-ver-hoy">Ver actividad familiar</button></section>`;
  }

  /* ---------- Para Lilu: solo actividad de la casa, nunca recuerdos privados ---------- */
  function paraIA(dias = 7) {
    const lim = Date.now() - dias * 86400000;
    return filas.filter((r) => cuando(r) >= lim).slice(0, 40).map((r) => ({ quien: mio(r) ? "la persona que pregunta" : autor(r), que: r.tipo, cuando: new Date(cuando(r)).toLocaleString("es-US", { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      ...(r.tipo === "compra" ? { productos: (r.data.items || []).map((x) => `${x.nombre}${x.texto ? " (" + x.texto + ")" : ""}`), tienda: r.data.tienda || undefined } : { producto: r.data.producto && r.data.producto.nombre, detalle: r.data.texto || (r.data.de ? `${r.data.de} → ${r.data.a}` : undefined) }) }));
  }
  /* Respuesta sin IA: "¿quién compró leche?", "¿qué compraron hoy?", "¿ya alguien compró huevos?", "¿qué agregó María?" */
  function responder(texto) {
    const t = plain(texto), pl = (x) => plain(x);
    const compras = filas.filter((r) => r.tipo === "compra");
    if (/que (se )?compraron hoy|que compro (la familia|alguien) hoy/.test(t)) {
      const hoy = new Date().toDateString(), rs = compras.filter((r) => new Date(cuando(r)).toDateString() === hoy);
      return rs.length ? "Hoy: " + rs.map((r) => `${autor(r)} compró ${(r.data.items || []).map((x) => x.nombre.toLowerCase()).join(", ")}`).join(". ") + "." : "Hoy nadie ha registrado compras.";
    }
    const m = t.match(/(?:quien|alguien) (?:compro|trajo) (?:la |el |los |las |una? )?(.+)$/);
    if (m) {
      const busca = m[1].replace(/^(la|el|los|las) /, "").trim();
      for (const r of compras) { const it = (r.data.items || []).find((x) => pl(x.nombre).includes(busca.replace(/e?s$/, "")) || busca.includes(pl(x.nombre))); if (it) return `${autor(r)} compró ${it.nombre.toLowerCase()}${cant(it.texto) ? ` (${cant(it.texto)})` : ""} ${hace(cuando(r))}${r.data.tienda ? ` en ${r.data.tienda}` : ""}.`; }
      return `No veo compras recientes de ${busca} en la casa.`;
    }
    const a = t.match(/que (?:productos |cosas )?(?:agrego|compro) (\w+)/);
    if (a) {
      const quien = a[1], rs = filas.filter((r) => pl(autor(r)).startsWith(quien) && (r.tipo === "compra" || r.tipo === "agregar")).slice(0, 5);
      if (rs.length) return `${autor(rs[0])}: ` + rs.map((r) => r.tipo === "compra" ? (r.data.items || []).map((x) => x.nombre.toLowerCase()).join(", ") : r.data.producto.nombre.toLowerCase()).join("; ") + ".";
    }
    return null;
  }

  /* ---------- Inicio ---------- */
  function iniciar() {
    window.addEventListener("cs-actividad", (e) => recibir(e.detail));
    window.addEventListener("online", () => setTimeout(recargar, 800));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) recargar(); });
    const b = document.getElementById("famact"); if (b) b.onclick = () => abrir();
    setTimeout(recargar, 300);
  }

  return { trasGuardar, registrar, recargar, recibir, filas: () => filas, pendientes, marcarTodo, marcarLeida, abrir, frase, autor,
    compradoPorOtro, yaHTML, avisarRepetido, compradoHoyHTML, paraIA, responder, cfg, iniciar };
})();
window.Actividad = Actividad;
Actividad.iniciar();
