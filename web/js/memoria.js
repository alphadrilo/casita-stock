/* Casita Stock — Memoria de Lilu (desde 2.0).
   Guarda solo los recuerdos que la persona confirma. Las conversaciones no se guardan.
   Con Supabase usa la tabla "memorias" (RLS: personal = solo quien lo guardó; hogar = toda la casa).
   En modo demo se guarda en este teléfono. Usa esc, icon y toast de app.js. */
const Memoria = (() => {
  const LS = "cs-memoria-demo";
  const TIPOS = { preferencia: "Gusto", marca: "Marca", tienda: "Tienda", producto: "Producto", habito: "Costumbre", correccion: "Corrección", otro: "Otro" };
  let back = null, lista = [], cargado = false, estado = "ok", cargando = null;

  /* ---------- Almacén ---------- */
  function demoStore() {
    const leer = () => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { return []; } };
    const poner = (a) => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} };
    return {
      demo: true,
      async listar() { return leer().sort((a, b) => (b.actualizado || "").localeCompare(a.actualizado || "")); },
      async crear(r) { const a = leer(), ahora = new Date().toISOString(); const n = { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), activo: true, mio: true, creado: ahora, actualizado: ahora, ...r }; a.push(n); poner(a); return n; },
      async cambiar(id, c) { const a = leer(); const i = a.findIndex((x) => x.id === id); if (i < 0) throw { code: "no_existe" }; a[i] = { ...a[i], ...c, actualizado: new Date().toISOString() }; poner(a); return a[i]; },
      async borrar(id) { poner(leer().filter((x) => x.id !== id)); },
    };
  }
  async function be() {
    if (back) return back;
    let b = null; try { b = window.claude ? await window.claude.use("memoria") : null; } catch (e) {}
    back = b || demoStore(); return back;
  }
  const activa = () => { try { return Voz.cfg().memoria !== false; } catch (e) { return true; } };
  const proponer = () => { try { return activa() && Voz.cfg().proponerRecuerdos !== false; } catch (e) { return true; } };

  async function recargar() {
    if (cargando) return cargando;
    cargando = (async () => {
      try { lista = await (await be()).listar(); estado = "ok"; }
      catch (e) { estado = e && e.code === "sin_tabla" ? "sin_tabla" : e && e.code === "sin_red" ? "sin_red" : "error"; }
      cargado = true; cargando = null; avisar(); return lista;
    })();
    return cargando;
  }
  const avisar = () => { try { window.dispatchEvent(new CustomEvent("cs-memoria", { detail: lista.length })); } catch (e) {} };
  async function asegurar() { if (!cargado) await recargar(); return lista; }

  /* ---------- Datos delicados ---------- */
  const NUNCA = [
    [/contraseñ|password|passcode|\bclave\b|\bpin\b|c[oó]digo de (seguridad|acceso|verificaci)|\bcvv\b|\bcvc\b/i, "claves o códigos de acceso"],
    [/tarjeta (de )?(cr[eé]dito|d[eé]bito)|n[uú]mero de (la )?tarjeta|cuenta (bancaria|corriente|de ahorro)|n[uú]mero de cuenta|\brouting\b|\biban\b/i, "datos de tarjetas o cuentas"],
    [/c[eé]dula|pasaporte|seguro social|\bssn\b|licencia de conducir|\bdni\b|\bcurp\b/i, "documentos de identidad"],
    [/(?:\d[ -]?){8,}/, "números largos que parecen de una tarjeta, cuenta o documento"],
  ];
  const DELICADO = [
    [/salud|enferm|diab[eé]t|alergi|al[eé]rgic|cel[ií]ac|intoleran|medic(amento|ina)|pastilla|tratamiento|embaraz|presi[oó]n alta|colesterol|terapia|psic[oó]log|depresi|ansiedad/i, "salud"],
    [/religi|iglesia|cristian|cat[oó]lic|evang[eé]lic|jud[ií]|musulm|ramad|kosher|halal/i, "religión"],
    [/pol[ií]tic|partido|votar|vot[oé]|elecci/i, "política"],
    [/salario|sueldo|me pagan|gano \$|ingreso|deuda|debo |pr[eé]stamo|hipoteca|cr[eé]dito/i, "dinero personal"],
    [/direcci[oó]n|vivo en|mi casa queda|calle \d|avenida|c[oó]digo postal|\bzip\b/i, "dirección"],
  ];
  /* explicito = la persona pidió con sus palabras que se recuerde */
  function revisar(texto, { explicito = false } = {}) {
    const t = String(texto || "").trim();
    if (t.length < 2) return { ok: false, motivo: "corto", aviso: "Ese recuerdo está vacío." };
    if (t.length > 280) return { ok: false, motivo: "largo", aviso: "Ese recuerdo es muy largo. Resúmelo en una frase." };
    for (const [re, que] of NUNCA) if (re.test(t)) return { ok: false, motivo: "nunca", aviso: `Por tu seguridad no guardo ${que}.` };
    for (const [re, que] of DELICADO) if (re.test(t) && !explicito) return { ok: false, motivo: "delicado", tema: que, aviso: `Eso toca un tema personal (${que}). Solo lo guardo si tú me pides que lo recuerde.` };
    return { ok: true };
  }
  const nrm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  function parecido(texto) {
    const a = nrm(texto); if (!a) return null;
    return lista.find((m) => { const b = nrm(m.texto); return b === a || (a.length > 12 && b.includes(a)) || (b.length > 12 && a.includes(b)); }) || null;
  }

  /* ---------- Operaciones ---------- */
  const tipoOk = (t) => (TIPOS[t] ? t : "otro");
  const ambitoOk = (a) => (a === "hogar" ? "hogar" : "personal");
  async function guardar({ texto, tipo, ambito, explicito = true, reemplaza }) {
    await asegurar();
    texto = String(texto || "").trim().replace(/\s+/g, " ");
    const r = revisar(texto, { explicito }); if (!r.ok) throw { code: "rechazado", ...r };
    if (reemplaza && lista.some((m) => m.id === reemplaza)) return cambiar(reemplaza, { texto, tipo: tipoOk(tipo), activo: true });
    const igual = parecido(texto); if (igual) { if (!igual.activo) return cambiar(igual.id, { activo: true }); return igual; }
    const n = await (await be()).crear({ texto, tipo: tipoOk(tipo), ambito: ambitoOk(ambito) });
    lista = [n, ...lista]; avisar(); return n;
  }
  async function cambiar(id, c) {
    if (c.texto != null) { c.texto = String(c.texto).trim().replace(/\s+/g, " "); const r = revisar(c.texto, { explicito: true }); if (!r.ok) throw { code: "rechazado", ...r }; }
    const n = await (await be()).cambiar(id, c);
    lista = lista.map((m) => (m.id === id ? { ...m, ...n } : m)); avisar(); return n;
  }
  async function borrar(id) { await (await be()).borrar(id); lista = lista.filter((m) => m.id !== id); avisar(); }
  async function borrarMios() { const mios = lista.filter((m) => m.mio); for (const m of mios) await borrar(m.id); return mios.length; }
  const buscar = (id) => lista.find((m) => m.id === id) || null;

  /* Lo que se manda a la IA: solo recuerdos activos, cortos, con su id */
  function paraIA() {
    if (!activa()) return [];
    return lista.filter((m) => m.activo).slice(0, 40).map((m) => ({ id: m.id, texto: m.texto, tipo: m.tipo, de: m.ambito === "hogar" ? "toda la casa" : "solo esta persona" }));
  }
  const textoAmbito = (a) => (a === "hogar" ? "para toda la casa" : "solo para ti");

  /* ---------- Pantalla “Lo que recuerda” ---------- */
  let editId = null, borrarId = null, borrarTodo = false;
  const host = () => { let h = document.getElementById("mem-host"); if (!h) { h = document.createElement("div"); h.id = "mem-host"; document.body.append(h); } return h; };
  const nombre = () => { try { return Voz.nombre(); } catch (e) { return "Lilu"; } };

  function filaHTML(m) {
    const puede = m.mio || m.ambito === "hogar";
    if (editId === m.id) return `<li class="mem-it edit" data-m="${esc(m.id)}">
      <label class="sr" for="me-t">Corregir recuerdo</label>
      <textarea id="me-t" rows="2" maxlength="280">${esc(m.texto)}</textarea>
      <div class="row"><button class="btn sm primary" data-mok>${icon("check")}Guardar</button><button class="btn sm" data-mno>Cancelar</button></div></li>`;
    if (borrarId === m.id) return `<li class="mem-it" data-m="${esc(m.id)}"><span class="mem-tx">¿Borrar “${esc(m.texto)}”? No se puede deshacer.</span>
      <div class="row"><button class="btn sm danger" data-mbok>${icon("trash")}Sí, borrar</button><button class="btn sm" data-mno>No</button></div></li>`;
    return `<li class="mem-it${m.activo ? "" : " off"}" data-m="${esc(m.id)}">
      <span class="mem-tx">${esc(m.texto)}<span class="mem-k">${esc(TIPOS[m.tipo] || "Otro")}${m.activo ? "" : " · en pausa"}</span></span>
      ${puede ? `<span class="mem-acc">
        <button class="mem-sw" role="switch" aria-checked="${m.activo}" data-msw aria-label="${m.activo ? "Pausar" : "Usar"} este recuerdo"><span></span></button>
        <button class="mem-b" data-med aria-label="Corregir">${icon("edit")}</button>
        <button class="mem-b" data-mdel aria-label="Borrar">${icon("trash")}</button></span>` : ""}
    </li>`;
  }
  function grupo(t, h, arr) {
    return `<section class="mem-g"><h3>${t}</h3><p class="hint">${h}</p>${arr.length ? `<ul class="mem-l">${arr.map(filaHTML).join("")}</ul>` : `<p class="mem-vacio">Nada todavía.</p>`}</section>`;
  }
  function sheetHTML() {
    const n = esc(nombre());
    const mios = lista.filter((m) => m.ambito !== "hogar"), casa = lista.filter((m) => m.ambito === "hogar");
    const aviso = estado === "sin_tabla" ? `<div class="notice warn">${icon("alert")}<span><b>Falta un paso en Supabase.</b> Pega el archivo <b>supabase/memoria-asistente.sql</b> en el SQL Editor para que ${n} pueda recordar. Mientras tanto no se guarda nada.</span></div>`
      : estado === "sin_red" ? `<div class="notice warn">${icon("alert")}<span>Sin conexión. Muestro lo último que se cargó.</span></div>`
      : estado === "error" ? `<div class="notice warn">${icon("alert")}<span>No se pudieron cargar los recuerdos. Intenta otra vez.</span></div>` : "";
    return `<div class="sheet-wrap" id="mem-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mem-t">
      <div class="grab" aria-hidden="true"></div>
      <div class="top"><h2 id="mem-t">Lo que ${n} recuerda</h2><button class="x" id="mem-x" aria-label="Cerrar">${icon("close")}</button></div>
      <p class="lead" style="margin:0">Solo guarda lo que tú confirmas. Las conversaciones no se guardan.${activa() ? "" : ` <b>La memoria está apagada:</b> ${n} no usa estos recuerdos.`}</p>
      ${aviso}
      <form class="mem-new" id="mem-f">
        <label for="mem-in">Enséñale algo</label>
        <input type="text" id="mem-in" maxlength="280" placeholder="Ej. La leche la compramos deslactosada" autocomplete="off" enterkeyhint="done">
        <div class="mem-amb" role="radiogroup" aria-label="Quién lo ve">
          <button type="button" role="radio" data-amb="personal" aria-checked="true">Solo para mí</button>
          <button type="button" role="radio" data-amb="hogar" aria-checked="false">Toda la casa</button>
        </div>
        <button class="btn primary" type="submit" ${estado === "sin_tabla" ? "disabled" : ""}>${icon("plus")}Guardar recuerdo</button>
      </form>
      ${grupo("Solo tú", "Los ves y los cambias solo tú.", mios)}
      ${grupo("Toda la casa", "Los ve toda la familia y cualquiera puede corregirlos.", casa)}
      ${lista.some((m) => m.mio) ? (borrarTodo
        ? `<div class="mem-todo"><span>¿Borrar todos tus recuerdos? No se puede deshacer.</span><div class="row"><button class="btn sm danger" id="mem-allok">Sí, borrar todos</button><button class="btn sm" id="mem-allno">No</button></div></div>`
        : `<button class="linkbtn danger" id="mem-all">Borrar todos mis recuerdos</button>`) : ""}
    </div></div>`;
  }
  let ambNuevo = "personal";
  function pintar() {
    const h = host(), sc = h.querySelector(".sheet"), y = sc ? sc.scrollTop : 0;
    h.innerHTML = sheetHTML(); const s = h.querySelector(".sheet"); if (s) s.scrollTop = y;
    const $m = (q) => h.querySelector(q);
    const cerrar = () => { h.innerHTML = ""; editId = borrarId = null; borrarTodo = false; if (!document.querySelector(".sheet-wrap")) document.body.classList.remove("noscroll"); window.dispatchEvent(new Event("cs-memoria-cerrada")); };
    $m("#mem-x").onclick = cerrar; $m("#mem-scrim").onclick = (e) => { if (e.target.id === "mem-scrim") cerrar(); };
    h.querySelectorAll("[data-amb]").forEach((b) => { b.setAttribute("aria-checked", b.dataset.amb === ambNuevo); b.onclick = () => { ambNuevo = b.dataset.amb; h.querySelectorAll("[data-amb]").forEach((x) => x.setAttribute("aria-checked", x === b)); }; });
    $m("#mem-f").onsubmit = async (e) => {
      e.preventDefault(); const t = $m("#mem-in").value.trim(); if (!t) return;
      try { await guardar({ texto: t, tipo: "preferencia", ambito: ambNuevo, explicito: true }); toast("Recuerdo guardado " + textoAmbito(ambNuevo)); pintar(); }
      catch (err) { toast(err && err.aviso ? err.aviso : errTexto(err)); }
    };
    h.querySelectorAll("[data-m]").forEach((li) => {
      const id = li.dataset.m, m = buscar(id); if (!m) return;
      const q = (s) => li.querySelector(s);
      if (q("[data-msw]")) q("[data-msw]").onclick = async () => { try { await cambiar(id, { activo: !m.activo }); toast(m.activo ? "Recuerdo en pausa" : "Recuerdo activo"); } catch (e) { toast(errTexto(e)); } pintar(); };
      if (q("[data-med]")) q("[data-med]").onclick = () => { editId = id; borrarId = null; pintar(); const t = h.querySelector("#me-t"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } };
      if (q("[data-mdel]")) q("[data-mdel]").onclick = () => { borrarId = id; editId = null; pintar(); };
      if (q("[data-mno]")) q("[data-mno]").onclick = () => { editId = borrarId = null; pintar(); };
      if (q("[data-mok]")) q("[data-mok]").onclick = async () => { const t = h.querySelector("#me-t").value.trim(); if (!t) return; try { await cambiar(id, { texto: t, tipo: m.tipo === "otro" ? "correccion" : m.tipo }); editId = null; toast("Recuerdo corregido"); } catch (e) { toast(e && e.aviso ? e.aviso : errTexto(e)); } pintar(); };
      if (q("[data-mbok]")) q("[data-mbok]").onclick = async () => { try { await borrar(id); toast("Recuerdo borrado"); } catch (e) { toast(errTexto(e)); } borrarId = null; pintar(); };
    });
    if ($m("#mem-all")) $m("#mem-all").onclick = () => { borrarTodo = true; pintar(); };
    if ($m("#mem-allno")) $m("#mem-allno").onclick = () => { borrarTodo = false; pintar(); };
    if ($m("#mem-allok")) $m("#mem-allok").onclick = async () => { try { const n = await borrarMios(); toast(n === 1 ? "Se borró 1 recuerdo" : `Se borraron ${n} recuerdos`); } catch (e) { toast(errTexto(e)); } borrarTodo = false; pintar(); };
  }
  const errTexto = (e) => (e && e.code === "sin_tabla" ? "Falta activar la memoria en Supabase." : e && e.code === "sin_red" ? "Sin conexión. Intenta otra vez." : "No se pudo guardar. Intenta otra vez.");
  async function abrir() { document.body.classList.add("noscroll"); host().innerHTML = ""; pintar(); await recargar(); if (host().innerHTML) pintar(); }

  /* ---------- Sección en Ajustes ---------- */
  function ajustesHTML() {
    const c = Voz.cfg(), n = esc(nombre()), act = lista.filter((m) => m.activo).length;
    return `<section class="card ai"><span class="aitag">${icon("bulb")}Memoria de ${n}</span>
      <button class="check" id="a-mem" aria-pressed="${c.memoria !== false}"><span class="box">${icon("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Usar lo que recuerda</span><br><span class="cm">Tus marcas, tiendas y costumbres para darte mejores consejos.</span></span><span></span></button>
      <button class="check" id="a-mprop" aria-pressed="${c.proponerRecuerdos !== false}"><span class="box">${icon("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Ofrecer guardar cosas útiles</span><br><span class="cm">Antes de recordar algo te pregunta. Nunca guarda claves ni datos de tarjetas.</span></span><span></span></button>
      <button class="btn sm" id="a-mver">${icon("list")}Ver lo que recuerda${cargado ? ` (${act})` : ""}</button>
    </section>`;
  }
  function bindAjustes() {
    const tg = (id, key) => { const b = document.querySelector(id); if (!b) return; b.onclick = () => { const v = Voz.cfg()[key] === false; Voz.guardar({ [key]: v }); b.setAttribute("aria-pressed", v); }; };
    tg("#a-mem", "memoria"); tg("#a-mprop", "proponerRecuerdos");
    const v = document.querySelector("#a-mver"); if (v) v.onclick = abrir;
    if (!cargado) recargar().then(() => { const b = document.querySelector("#a-mver"); if (b) b.innerHTML = `${icon("list")}Ver lo que recuerda (${lista.filter((m) => m.activo).length})`; });
  }

  return { recargar, asegurar, lista: () => lista, estado: () => estado, activa, proponer, revisar, parecido, guardar, cambiar, borrar, borrarMios, buscar, paraIA, abrir, ajustesHTML, bindAjustes, TIPOS, textoAmbito };
})();
window.Memoria = Memoria;
