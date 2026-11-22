/* Casita Stock — Presupuesto del mes (desde 2.2).
   Un presupuesto para toda la casa, guardado en ajustes/presupuesto ({monto, avisar}).
   Lo gastado sale de las compras con precio del mes (spending() de app.js).
   Usa presupuesto, store, spending, lista, listaNeeded, inventory, precioEn, recBuy, money, esc, icon, toast. */
const Presupuesto = (() => {
  const PCTS = [70, 80, 90];
  const mes = () => today().slice(0, 7);
  const activo = () => !!(presupuesto && +presupuesto.monto > 0);

  function diasQuedan() { const d = new Date(), fin = new Date(d.getFullYear(), d.getMonth() + 1, 0); return fin.getDate() - d.getDate() + 1; }
  function estado() {
    if (!activo()) return null;
    const monto = +presupuesto.monto, avisar = +presupuesto.avisar || 80, gastado = Math.round(spending().tm * 100) / 100;
    const pct = Math.round((gastado / monto) * 100), quedan = Math.round((monto - gastado) * 100) / 100;
    const nivel = pct >= 100 ? "pasado" : pct >= avisar ? "cerca" : "bien";
    return { monto, avisar, gastado, pct, quedan, nivel, dias: diasQuedan(), porDia: quedan > 0 ? Math.floor((quedan / diasQuedan()) * 100) / 100 : 0 };
  }
  /* Cuánto costaría lo pendiente de la lista (solo lo que tiene precio) */
  function costoLista(tienda = "") {
    const ids = new Set(), filas = [];
    lista.filter((x) => !x.marcado).forEach((e) => { const p = e.productoId && inventory.find((x) => x.id === e.productoId); if (p) { ids.add(p.id); filas.push([p, e.cantidad]); } else filas.push([null, e.cantidad || 1]); });
    listaNeeded().forEach((p) => { if (!ids.has(p.id)) filas.push([p, recBuy(p)]); });
    let total = 0, con = 0;
    for (const [p, n] of filas) { if (!p) continue; const pr = precioEn(p, tienda) ?? precioEn(p, ""); if (pr != null) { total += pr * n; con++; } }
    return { total: Math.round(total * 100) / 100, con, de: filas.length };
  }

  /* ---------- Tarjeta (pestaña Asistente) ---------- */
  function tarjetaHTML() {
    const e = estado();
    if (!e) return `<div class="pres-vacio"><p class="lead" style="margin:0">Pon cuánto quieres gastar al mes y te aviso cuando vayas cerca.</p>
      ${canWrite ? `<button class="btn sm" id="pres-edit">${icon("money")}Poner un presupuesto</button>` : ""}</div>`;
    const txt = e.nivel === "pasado" ? `Te pasaste por ${money(-e.quedan)}.` : `Te quedan <b>${money(e.quedan)}</b> para ${e.dias === 1 ? "hoy" : `${e.dias} días`} (unos ${money(e.porDia)} por día).`;
    return `<div class="pres ${e.nivel}">
      <div class="pres-top"><span>Presupuesto del mes</span><span class="pres-pct">${e.pct} %</span></div>
      <div class="pres-bar" role="progressbar" aria-valuenow="${Math.min(100, e.pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Gastado del presupuesto"><i style="width:${Math.min(100, Math.max(2, e.pct))}%"></i><b style="left:${e.avisar}%"></b></div>
      <p class="pres-txt">${money(e.gastado)} de ${money(e.monto)}. ${txt}</p>
      ${e.nivel !== "bien" ? `<div class="notice warn">${icon("alert")}<span>${e.nivel === "pasado" ? "Ya gastaste todo el presupuesto de este mes." : `Ya vas en el ${e.pct} % del presupuesto.`}</span></div>` : ""}
      ${canWrite ? `<button class="linkbtn" id="pres-edit">Cambiar presupuesto</button>` : ""}
    </div>`;
  }
  /* Línea para la lista de compras */
  function listaHTML(tienda) {
    const e = estado(); if (!e) return "";
    const c = costoLista(tienda); if (!c.con) return "";
    const tras = Math.round(((e.gastado + c.total) / e.monto) * 100);
    const mal = tras >= 100, cerca = tras >= e.avisar;
    return `<p class="pres-lista ${mal ? "pasado" : cerca ? "cerca" : ""}">${icon("money")}<span>Con esta compra ${mal ? `te pasarías del presupuesto (llegarías al ${tras} %)` : `llegarías al <b>${tras} %</b> del presupuesto`}. Te quedan ${money(Math.max(0, e.quedan))}.</span></p>`;
  }

  /* ---------- Editor ---------- */
  let pctSel = 80;
  const host = () => { let h = document.getElementById("pres-host"); if (!h) { h = document.createElement("div"); h.id = "pres-host"; document.body.append(h); } return h; };
  function abrir() {
    const sp = spending(), act = activo();
    pctSel = act ? +presupuesto.avisar || 80 : 80;
    const suger = sp.tl ? Math.ceil(sp.tl / 10) * 10 : null;
    host().innerHTML = `<div class="sheet-wrap" id="pres-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pres-t">
      <div class="grab" aria-hidden="true"></div>
      <div class="top"><h2 id="pres-t">Presupuesto del mes</h2><button class="x" id="pres-x" aria-label="Cerrar">${icon("close")}</button></div>
      <p class="lead" style="margin:0">Es para toda la casa: todos ven lo mismo. Cuenta las compras que tienen precio.</p>
      <div class="field"><label for="pres-m">¿Cuánto quieren gastar al mes?</label>
        <div class="pres-in"><span>$</span><input id="pres-m" type="text" inputmode="decimal" autocomplete="off" placeholder="${suger || 400}" value="${act ? presupuesto.monto : ""}"></div>
        ${sp.tl ? `<p class="hint" style="margin:0">El mes pasado gastaron ${money(sp.tl)}.${!act ? ` <button class="linkbtn" id="pres-sug" type="button">Usar ${money(suger)}</button>` : ""}</p>` : ""}</div>
      <div class="field"><span class="lbl">Avisarme cuando llegue al</span>
        <div class="chips" role="radiogroup" aria-label="Avisar al">${PCTS.map((p) => `<button class="chip" role="radio" data-pp="${p}" aria-checked="${p === pctSel}">${p} %</button>`).join("")}</div></div>
      <div class="row"><button class="btn primary" id="pres-ok" style="flex:1">${icon("check")}Guardar</button></div>
      ${act ? `<button class="linkbtn danger" id="pres-del">Quitar el presupuesto</button>` : ""}
    </div></div>`;
    document.body.classList.add("noscroll");
    const $p = (q) => host().querySelector(q);
    const cerrar = () => { host().innerHTML = ""; if (!document.querySelector(".sheet-wrap")) document.body.classList.remove("noscroll"); };
    $p("#pres-x").onclick = cerrar; $p("#pres-scrim").onclick = (e) => { if (e.target.id === "pres-scrim") cerrar(); };
    host().querySelectorAll("[data-pp]").forEach((b) => b.onclick = () => { pctSel = +b.dataset.pp; host().querySelectorAll("[data-pp]").forEach((x) => x.setAttribute("aria-checked", x === b)); });
    if ($p("#pres-sug")) $p("#pres-sug").onclick = () => { $p("#pres-m").value = suger; };
    $p("#pres-ok").onclick = async () => {
      const v = parseFloat(String($p("#pres-m").value).replace(/[^\d.,]/g, "").replace(",", "."));
      if (!(v > 0)) { toast("Escribe cuánto quieren gastar al mes"); $p("#pres-m").focus(); return; }
      try { await store.savePresupuesto({ monto: Math.round(v * 100) / 100, avisar: pctSel, mes: mes() }); cerrar(); toast(`Presupuesto: ${money(v)} al mes`); render(); }
      catch (e) { writeErr(e); }
    };
    if ($p("#pres-del")) $p("#pres-del").onclick = async () => { const antes = { ...presupuesto }; try { await store.savePresupuesto(null); cerrar(); toast("Presupuesto quitado", () => store.savePresupuesto(antes).then(render)); render(); } catch (e) { writeErr(e); } };
    setTimeout(() => { const i = $p("#pres-m"); if (i && !act) i.focus(); }, 250);
  }
  function bind() { const b = document.getElementById("pres-edit"); if (b) b.onclick = abrir; }

  /* ---------- Aviso del iPhone al cruzar el límite (una vez por mes y por nivel) ---------- */
  function avisoIPhone() {
    const e = estado(); if (!e || e.nivel === "bien") return null;
    const clave = `cs-pres-aviso-${mes()}-${e.nivel}`;
    let f = null; try { f = +localStorage.getItem(clave) || null; if (!f) { f = Date.now() + 15000; localStorage.setItem(clave, String(f)); } } catch (x) { return null; }
    return { id: `pres-${mes()}-${e.nivel}`, fecha: f, titulo: e.nivel === "pasado" ? "Te pasaste del presupuesto" : `Vas en el ${e.pct} % del presupuesto`,
      texto: e.nivel === "pasado" ? `Este mes llevan ${money(e.gastado)} de ${money(e.monto)}.` : `Llevan ${money(e.gastado)} de ${money(e.monto)}. Quedan ${money(e.quedan)} para ${e.dias} días.`, abrir: "ai" };
  }
  /* Una línea para el asistente */
  function paraIA() { const e = estado(); return e ? `Presupuesto del mes: ${money(e.monto)}; gastado ${money(e.gastado)} (${e.pct} %); quedan ${money(e.quedan)} para ${e.dias} días.` : ""; }

  return { activo, estado, costoLista, tarjetaHTML, listaHTML, abrir, bind, avisoIPhone, paraIA };
})();
window.Presupuesto = Presupuesto;
