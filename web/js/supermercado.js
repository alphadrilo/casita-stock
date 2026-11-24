/* Casita Stock — Modo "estoy en el supermercado" (desde 2.2).
   Pantalla de una mano: tocas lo que metes al carrito, ajustas cantidad y precio, ves el total en vivo
   y el presupuesto. También por voz: "metí 2 leches". Al terminar usa la misma revisión de siempre.
   Usa lista, inventory, listaNeeded, toggleNeeded, store, recBuy, ppOf, emp, PASILLOS, catDe, precioEn,
   tiendaLista, tiendasLista, openScreen, closeScreen, screen, money, esc, icon, toast, uid, me, canWrite,
   review, Voz, Presupuesto, plain, keyOf y NUMS. */
const Super = (() => {
  let precioDe = null, oyendo = false, ultimo = "";

  /* Las filas: lo de la lista + lo que se acaba en casa */
  function filas() {
    const out = [], ids = new Set();
    for (const e of lista) {
      const p = e.productoId && inventory.find((x) => x.id === e.productoId);
      if (p) ids.add(p.id);
      out.push({ key: e.id, e, p: p || null, n: p ? p.nombre : e.nombre, cat: p ? p.categoria || catDe(p.nombre) : catDe(e.nombre), on: !!e.marcado });
    }
    for (const p of listaNeeded()) if (!ids.has(p.id)) out.push({ key: "auto:" + p.id, e: null, p, n: p.nombre, cat: p.categoria || catDe(p.nombre), on: false });
    return out;
  }
  const pp = (f) => (f.p ? ppOf(f.p) : 1);
  const paquetes = (f) => { const u = f.e ? f.e.cantidad || 1 : recBuy(f.p); return f.p ? Math.max(1, Math.ceil(u / pp(f))) : u; };
  /* Precio por paquete: el que escribiste aquí, o el de la tienda (aproximado) */
  function precio(f) {
    if (f.e && f.e.precioPaq != null) return { v: +f.e.precioPaq, real: true };
    if (!f.p) return null;
    const pr = precioEn(f.p, tiendaLista) ?? precioEn(f.p, "");
    return pr != null ? { v: Math.round(pr * pp(f) * 100) / 100, real: false } : null;
  }
  function totales(fs) {
    let total = 0, sinPrecio = 0, aprox = false; const en = fs.filter((f) => f.on);
    for (const f of en) { const pr = precio(f); if (!pr) { sinPrecio++; continue; } total += pr.v * paquetes(f); if (!pr.real) aprox = true; }
    return { total: Math.round(total * 100) / 100, en: en.length, de: fs.length, sinPrecio, aprox };
  }

  /* ---------- Cambios ---------- */
  async function guardarFila(f, cambios) {
    const id = f.e ? f.e.id : "p_" + f.p.id;
    const base = f.e || { productoId: f.p.id, nombre: f.p.nombre, cantidad: recBuy(f.p), marcado: false, creado: Date.now(), u: me || "" };
    const { id: _x, ...d } = { ...base, ...cambios };
    try { await store.set("lista", id, d); } catch (err) { writeErr(err); }
  }
  const alternar = (f) => { if (!f.on && window.Actividad) Actividad.avisarRepetido(f.p || { nombre: f.n }); return guardarFila(f, { marcado: !f.on }); };
  const cambiarCant = (f, delta) => { const n = Math.max(1, paquetes(f) + delta); guardarFila(f, { cantidad: f.p ? n * pp(f) : n }); };

  /* ---------- Voz: "metí 2 leches", "puse el pan y 6 bananos" ---------- */
  function entender(texto) {
    const t = plain(texto).replace(/^(ya )?(meti|puse|agregue|agarre|tengo|llevo|eche|tome|compre)\s+/, "");
    const partes = t.split(/\s*(?:,| y | tambien | ademas )\s*/).filter(Boolean);
    const fs = filas(), hechos = [];
    for (const parte of partes) {
      let n = null; const m = parte.match(/\b(\d+)\b/); if (m) n = +m[1]; else for (const w of parte.split(" ")) if (w in NUMS && w !== "media") { n = NUMS[w]; break; }
      const k = keyOf(parte); if (!k) continue;
      const pal = k.split(" ").filter((w) => w.length > 2);
      let mejor = null, punt = 0;
      for (const f of fs) {
        const nk = keyOf(f.n) + " " + ((f.p && f.p.alias) || []).join(" ");
        const s = pal.filter((w) => nk.includes(w)).length;
        if (s > punt) { punt = s; mejor = f; }
      }
      hechos.push({ f: mejor, n, texto: parte, k });
    }
    return hechos;
  }
  async function aplicarVoz(texto) {
    const hs = entender(texto); if (!hs.length) { toast("No entendí. Di por ejemplo: “metí 2 leches”"); return; }
    const dichos = [];
    for (const h of hs) {
      if (h.f) {
        const c = { marcado: true }; if (h.n) c.cantidad = h.f.p ? h.n * pp(h.f) : h.n;
        await guardarFila(h.f, c); dichos.push(`${h.n ? h.n + " " : ""}${h.f.n}`);
      } else {
        const nombre = h.k.charAt(0).toUpperCase() + h.k.slice(1);
        await store.set("lista", uid(), { productoId: "", nombre, cantidad: h.n || 1, marcado: true, creado: Date.now(), u: me || "" });
        dichos.push(`${h.n ? h.n + " " : ""}${nombre} (no estaba en la lista)`);
      }
    }
    ultimo = "Al carrito: " + dichos.join(", "); toast(ultimo); pintar();
  }
  async function oir() {
    if (oyendo) { try { Voz.parar(); } catch (e) {} return; }
    if (!Voz.soportado) { toast("Usa el micrófono del teclado para dictar"); return; }
    oyendo = true; pintar();
    try { const r = await Voz.escuchar({ onParcial: (t) => { const o = document.getElementById("sm-oye"); if (o) o.textContent = t; } }); oyendo = false; if (r && String(r).trim()) await aplicarVoz(r); else pintar(); }
    catch (e) { oyendo = false; toast(Voz.mensajeError ? Voz.mensajeError(e) : "No te escuché"); pintar(); }
  }

  /* ---------- Pantalla ---------- */
  function filaHTML(f) {
    const pr = precio(f), q = paquetes(f), unidad = f.p && pp(f) > 1 ? ` ${esc(emp(f.p))}` : "";
    const editando = precioDe === f.key;
    return `<li class="sm-it${f.on ? " on" : ""}">
      <button class="sm-check" data-smt="${esc(f.key)}" aria-pressed="${f.on}" aria-label="${f.on ? "Sacar del carrito" : "Meter al carrito"}: ${esc(f.n)}"><span class="box">${icon("check")}</span>
        <span class="sm-n"><b>${esc(f.n)}</b><span>${pr ? `${money(pr.v)}${unidad ? " c/" + unidad.trim() : ""}${pr.real ? "" : " aprox."}` : "Sin precio"}</span>${window.Actividad && !f.on ? Actividad.yaHTML(f.p || { nombre: f.n }) : ""}</span></button>
      <div class="sm-acc">
        <span class="stepper sm"><button data-smq="-1" data-k="${esc(f.key)}" aria-label="Menos">−</button><output>×${q}</output><button data-smq="1" data-k="${esc(f.key)}" aria-label="Más">+</button></span>
        <button class="sm-pr" data-smp="${esc(f.key)}" aria-label="Escribir precio de ${esc(f.n)}">$</button>
      </div>
      ${editando ? `<div class="sm-precio"><label for="sm-pin">Precio${unidad ? " por" + unidad : ""}</label><input id="sm-pin" type="text" inputmode="decimal" autocomplete="off" value="${pr && pr.real ? pr.v : ""}" placeholder="${pr ? pr.v : "0.00"}"><button class="btn sm primary" data-smok="${esc(f.key)}">Listo</button></div>` : ""}
    </li>`;
  }
  function html() {
    const fs = filas(), t = totales(fs);
    const ts = tiendasLista(); if (tiendaLista && !ts.includes(tiendaLista)) ts.unshift(tiendaLista);
    let pres = "";
    if (window.Presupuesto && Presupuesto.activo()) {
      const e = Presupuesto.estado(), pct = Math.round(((e.gastado + t.total) / e.monto) * 100), nv = pct >= 100 ? "pasado" : pct >= e.avisar ? "cerca" : "bien";
      pres = `<div class="sm-pres ${nv}"><div class="pres-bar"><i style="width:${Math.min(100, Math.max(2, pct))}%"></i><b style="left:${e.avisar}%"></b></div><span>${nv === "pasado" ? `Con el carrito te pasas del presupuesto (${pct} %)` : `Con el carrito llegas al ${pct} % del presupuesto`}</span></div>`;
    }
    const grupos = PASILLOS.map((c) => { const g = fs.filter((f) => (PASILLOS.includes(f.cat) ? f.cat : "Otros") === c).sort((a, b) => a.on - b.on || a.n.localeCompare(b.n));
      return g.length ? `<section class="sm-g"><h3>${esc(c)}<span>${g.filter((f) => f.on).length}/${g.length}</span></h3><ul class="sm-l">${g.map(filaHTML).join("")}</ul></section>` : ""; }).join("");
    return `<div class="smk">
      <div class="sm-head">
        <button class="btn sm" id="sm-x">${icon("back")}Lista</button>
        <div class="sm-tot" aria-live="polite"><span>${t.aprox ? "≈ " : ""}${money(t.total) || "$0"}</span><small>${t.en} de ${t.de} en el carrito${t.sinPrecio ? ` · ${t.sinPrecio} sin precio` : ""}</small></div>
      </div>
      ${ts.length ? `<div class="chips scroll" role="radiogroup" aria-label="Tienda">${ts.map((x) => `<button class="chip" role="radio" data-smti="${esc(x)}" aria-checked="${tiendaLista === x}">${esc(x)}</button>`).join("")}</div>` : ""}
      ${pres}
      ${oyendo ? `<div class="sm-oye"><span class="dot"></span><span id="sm-oye">Te escucho… di “metí 2 leches”</span></div>` : ultimo ? `<p class="hint sm-ult">${esc(ultimo)}</p>` : ""}
      ${fs.length ? grupos : `<p class="lead">Tu lista está vacía.</p>`}
    </div>`;
  }
  let V = null, B = null;
  function pintar() { if (V && screen === "super") render(); }
  function renderSuper(v, bar) {
    V = v; B = bar;
    const y = scrollY; v.innerHTML = html();
    const fs = filas(), porKey = (k) => fs.find((f) => f.key === k);
    $("#sm-x").onclick = () => { precioDe = null; ultimo = ""; closeScreen(); };
    $$("[data-smti]").forEach((b) => b.onclick = () => { tiendaLista = b.dataset.smti; try { localStorage.setItem("cs-lista-tienda", tiendaLista); } catch (e) {} render(); });
    $$("[data-smt]").forEach((b) => b.onclick = () => { const f = porKey(b.dataset.smt); if (f && canWrite) alternar(f); });
    $$("[data-smq]").forEach((b) => b.onclick = () => { const f = porKey(b.dataset.k); if (f && canWrite) cambiarCant(f, +b.dataset.smq); });
    $$("[data-smp]").forEach((b) => b.onclick = () => { precioDe = precioDe === b.dataset.smp ? null : b.dataset.smp; render(); setTimeout(() => { const i = $("#sm-pin"); if (i) i.focus(); }, 50); });
    const ok = $("[data-smok]");
    if (ok) {
      const guardarPrecio = () => { const f = porKey(ok.dataset.smok); const raw = $("#sm-pin").value.trim(); precioDe = null;
        if (!raw) { if (f && f.e && f.e.precioPaq != null) guardarFila(f, { precioPaq: null }); else render(); return; }
        const v2 = parseFloat(raw.replace(/[^\d.,]/g, "").replace(",", ".")); if (!(v2 >= 0)) { toast("Escribe solo el número, ej. 2.50"); render(); return; }
        guardarFila(f, { precioPaq: Math.round(v2 * 100) / 100, marcado: true }); };
      ok.onclick = guardarPrecio; $("#sm-pin").onkeydown = (e) => { if (e.key === "Enter") guardarPrecio(); };
    }
    if (Math.abs(scrollY - y) > 2) scrollTo(0, y);
    const marcados = fs.filter((f) => f.on);
    bar.innerHTML = canWrite ? `<div class="sm-bar"><button class="sm-mic${oyendo ? " oye" : ""}" id="sm-mic" aria-label="${oyendo ? "Dejar de escuchar" : "Decir lo que metiste al carrito"}">${icon("mic")}</button>
      <button class="btn primary" id="sm-fin" ${marcados.length ? "" : "disabled"}>${icon("check")}${marcados.length ? `Terminé (${marcados.length})` : "Toca lo que metes"}</button></div>` : "";
    if ($("#sm-mic")) $("#sm-mic").onclick = oir;
    if ($("#sm-fin")) $("#sm-fin").onclick = terminar;
  }
  function terminar() {
    const fs = filas().filter((f) => f.on); if (!fs.length) return;
    review = { origen: "lista", tienda: tiendaLista || "", fecha: today(), rows: fs.map((f) => {
      const p = f.p, pr = f.e && f.e.precioPaq != null ? String(f.e.precioPaq) : "";
      return { key: uid(), listaId: f.e ? f.e.id : "p_" + p.id, productoId: p ? p.id : "", nombre: f.n, cantidad: paquetes(f), precio: pr, pp: pp(f), empaque: p ? p.empaque : "", unidad: p ? p.unidad : "" }; }) };
    precioDe = null; ultimo = ""; openScreen("review", "list");
  }
  const abrir = () => { precioDe = null; ultimo = ""; openScreen("super", "list"); };

  return { abrir, renderSuper, filas, totales, entender, aplicarVoz, terminar };
})();
window.Super = Super;
