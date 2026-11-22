/* Casita Stock — Avisos en el iPhone (desde 2.1).
   La app calcula qué se acaba y qué vence en los próximos 7 días y programa un aviso al día a la hora elegida.
   En la app de Xcode los avisos llegan con la app cerrada (plugin nativo AvisosNativos, sin servidor).
   En Safari solo se ve el número en el ícono (si el iPhone lo permite) y los avisos dentro de la app.
   Usa inventory, lista, daysLeft, expInfo, enUso, listaNeeded, esc, icon y toast de app.js. */
const Avisos = (() => {
  const LS = "cs-avisos";
  const DEF = { activo: false, hora: "08:00", acaba: true, vence: true };
  const N = () => (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.AvisosNativos) || null;
  let firma = "", timer = null, permiso = "preguntar", programados = 0;

  const cfg = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(LS) || "{}") }; } catch (e) { return { ...DEF }; } };
  const guardar = (c) => { try { localStorage.setItem(LS, JSON.stringify({ ...cfg(), ...c })); } catch (e) {} firma = ""; reprogramar(0); };
  const nativo = () => !!N();

  /* ---------- Cálculo ---------- */
  const enLaLista = () => new Set(lista.filter((x) => x.productoId && !x.marcado).map((x) => x.productoId));
  const diasTxt = (r) => (r < 1.5 ? "1 o 2 días" : `unos ${Math.round(r)} días`);
  const minus = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  function fechaA(k, hora) { const [h, m] = hora.split(":").map(Number); const d = new Date(); d.setDate(d.getDate() + k); d.setHours(h, m || 0, 0, 0); return d; }

  /* Qué avisar el día k (0 = hoy) */
  function delDia(k, c = cfg()) {
    const yaLista = enLaLista(), acaba = [], vence = [];
    for (const p of inventory) {
      if (c.acaba && (p.cantidad > 0 || enUso(p)) && !yaLista.has(p.id)) {
        const d = daysLeft(p);
        if (d != null) {
          const r = d - k, umbral = (p.consumo && p.consumo.avisarDias) || 3;
          if (r > 0 && r <= umbral && (k === 0 || d > umbral || r <= 1)) acaba.push({ n: p.nombre, r });
        }
      }
      if (c.vence && p.cantidad > 0) {
        const e = expInfo(p);
        if (e && e.d - k >= 0 && e.d - k <= 1) vence.push({ n: p.nombre, r: e.d - k });
      }
    }
    acaba.sort((a, b) => a.r - b.r); vence.sort((a, b) => a.r - b.r);
    return { acaba, vence };
  }
  function mensaje({ acaba, vence }) {
    const total = acaba.length + vence.length; if (!total) return null;
    const partes = [];
    if (acaba.length) partes.push(acaba.slice(0, 3).map((x, i) => `${i ? minus(x.n) : x.n} (${diasTxt(x.r)})`).join(", ") + (acaba.length > 3 ? ` y ${acaba.length - 3} más` : "") + (acaba.length === 1 ? " se acaba pronto." : " se acaban pronto."));
    if (vence.length) { const hoy = vence.filter((x) => x.r === 0).map((x) => x.n), man = vence.filter((x) => x.r === 1).map((x) => x.n);
      if (hoy.length) partes.push(`${hoy.join(", ")} ${hoy.length === 1 ? "vence" : "vencen"} hoy.`);
      if (man.length) partes.push(`${man.join(", ")} ${man.length === 1 ? "vence" : "vencen"} mañana.`); }
    const titulo = acaba.length && vence.length ? "Revisa tu casa" : acaba.length ? (acaba.length === 1 ? "Algo se acaba pronto" : `${acaba.length} cosas se acaban pronto`) : vence.length === 1 ? "Algo vence pronto" : `${vence.length} cosas vencen pronto`;
    return { titulo, texto: partes.join(" ") + (acaba.length ? " Toca para verlo en tu lista." : ""), abrir: acaba.length ? "list" : "inv" };
  }
  /* Los avisos de los próximos 7 días (solo los que tienen algo que decir) */
  function plan(c = cfg()) {
    const out = [], ahora = Date.now();
    for (let k = 0; k < 7; k++) {
      const f = fechaA(k, c.hora); if (f.getTime() <= ahora + 60000) continue;
      const m = mensaje(delDia(k, c)); if (!m) continue;
      out.push({ id: "d" + f.toISOString().slice(0, 10), fecha: f.getTime(), ...m });
    }
    return out;
  }
  const pendientesLista = () => listaNeeded().length + lista.filter((x) => !x.marcado).length;

  /* ---------- Programar ---------- */
  async function aplicar() {
    const c = cfg(), badge = pendientesLista();
    const avisos = c.activo ? plan(c).map((a) => ({ ...a, insignia: badge })) : [];
    const f = JSON.stringify([c, avisos.map((a) => [a.id, a.fecha, a.texto]), badge]);
    if (f === firma) return; firma = f;
    const n = N();
    if (n) {
      try {
        if (!c.activo || permiso !== "si") { await n.cancelar(); programados = 0; }
        else { const r = await n.programar({ avisos }); programados = (r && r.programados) || 0; }
        if (c.activo && permiso === "si") await n.insignia({ n: badge }); else await n.insignia({ n: 0 });
      } catch (e) { firma = ""; }
    } else if ("setAppBadge" in navigator && c.activo) {
      try { badge ? await navigator.setAppBadge(badge) : await navigator.clearAppBadge(); } catch (e) {}
    }
  }
  function reprogramar(ms = 1500) { if (typeof loaded !== "undefined" && !loaded) return; clearTimeout(timer); timer = setTimeout(aplicar, ms); }

  async function leerEstado() {
    const n = N();
    if (n) { try { const r = await n.estado(); permiso = r.permiso; programados = r.programados || 0; } catch (e) {} }
    else permiso = "Notification" in window ? (Notification.permission === "granted" ? "si" : Notification.permission === "denied" ? "no" : "preguntar") : "no_disponible";
    return permiso;
  }
  async function pedirPermiso() {
    const n = N();
    if (n) { try { permiso = (await n.pedirPermiso()).permiso; } catch (e) { permiso = "no"; } }
    else if ("Notification" in window) { try { const r = await Notification.requestPermission(); permiso = r === "granted" ? "si" : r === "denied" ? "no" : "preguntar"; } catch (e) {} }
    return permiso;
  }
  async function probar() {
    const n = N(); if (!n) return false;
    if (permiso !== "si" && (await pedirPermiso()) !== "si") return false;
    const m = mensaje(delDia(0, { ...cfg(), acaba: true, vence: true })) || { titulo: "Casita Stock", texto: "Así te llegarán los avisos de lo que se acaba y lo que vence.", abrir: "list" };
    await n.programar({ avisos: [...plan().map((a) => ({ ...a, insignia: pendientesLista() })), { id: "prueba", fecha: Date.now() + 5000, ...m }] });
    firma = ""; return true;
  }

  /* ---------- Ajustes ---------- */
  const HORAS = ["07:00", "08:00", "09:00", "12:00", "17:00", "19:00", "21:00"];
  const horaTxt = (h) => { const [a, b] = h.split(":").map(Number); return `${a % 12 || 12}:${String(b).padStart(2, "0")} ${a < 12 ? "a. m." : "p. m."}`; };
  function proximoHTML() {
    const c = cfg(); if (!c.activo) return "";
    const p = plan(c)[0];
    if (!p) return `<p class="av-prox">Por ahora no hay nada que avisar esta semana.</p>`;
    const f = new Date(p.fecha), hoy = new Date(), man = new Date(); man.setDate(hoy.getDate() + 1);
    const cuando = f.toDateString() === hoy.toDateString() ? "Hoy" : f.toDateString() === man.toDateString() ? "Mañana" : f.toLocaleDateString("es-US", { weekday: "long", day: "numeric" });
    return `<p class="av-prox"><b>Próximo aviso: ${esc(cuando)}, ${horaTxt(c.hora)}</b>${esc(p.texto)}</p>`;
  }
  function ajustesHTML() {
    const c = cfg(), nat = nativo();
    const neg = permiso === "no";
    return `<section class="card"><span class="aitag g">${icon("bell")}Avisos en el iPhone</span>
      <button class="check" id="av-on" aria-pressed="${c.activo && !neg}"><span class="box">${icon("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Avisarme cada día</span><br><span class="cm">Un aviso con lo que se acaba y lo que vence. Solo si hay algo que contar.</span></span><span></span></button>
      ${neg ? `<div class="notice warn">${icon("alert")}<span>El iPhone tiene los avisos apagados para Casita Stock. Enciéndelos en <b>Ajustes del iPhone → Casita Stock → Notificaciones</b>.</span></div>` : ""}
      ${c.activo && !neg ? `
      <div class="av-hora"><label for="av-h">¿A qué hora?</label><select id="av-h">${HORAS.map((h) => `<option value="${h}" ${h === c.hora ? "selected" : ""}>${horaTxt(h)}</option>`).join("")}</select></div>
      <button class="check" id="av-ac" aria-pressed="${c.acaba}"><span class="box">${icon("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Lo que se va a acabar</span><br><span class="cm">Según cómo lo usan en casa.</span></span><span></span></button>
      <button class="check" id="av-ve" aria-pressed="${c.vence}"><span class="box">${icon("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Lo que vence hoy o mañana</span></span><span></span></button>
      ${proximoHTML()}
      ${nat ? `<button class="btn sm" id="av-prueba">${icon("bell")}Probar un aviso ahora</button>` : ""}` : ""}
      ${nat ? "" : `<p class="hint" style="margin:0">En Safari el iPhone no deja que la app avise con la app cerrada. Aquí verás el número de pendientes en el ícono y los avisos al abrirla. Con la app de Xcode los avisos llegan aunque esté cerrada.</p>`}
    </section>`;
  }
  function bindAjustes(repintar) {
    const $a = (q) => document.querySelector(q);
    if ($a("#av-on")) $a("#av-on").onclick = async () => {
      const c = cfg();
      if (!c.activo) { const p = await pedirPermiso(); if (p === "no") { toast("El iPhone no dio permiso para avisos"); repintar(); return; } guardar({ activo: true }); toast(`Te aviso cada día a las ${horaTxt(cfg().hora)}`); }
      else { guardar({ activo: false }); toast("Avisos apagados"); }
      repintar();
    };
    if ($a("#av-h")) $a("#av-h").onchange = (e) => { guardar({ hora: e.target.value }); repintar(); };
    if ($a("#av-ac")) $a("#av-ac").onclick = () => { guardar({ acaba: !cfg().acaba }); repintar(); };
    if ($a("#av-ve")) $a("#av-ve").onclick = () => { guardar({ vence: !cfg().vence }); repintar(); };
    if ($a("#av-prueba")) $a("#av-prueba").onclick = async () => { toast((await probar()) ? "En 5 segundos te llega un aviso de prueba" : "El iPhone no dio permiso para avisos"); };
  }

  /* ---------- Inicio ---------- */
  function iniciar() {
    leerEstado().then(() => reprogramar(500));
    const n = N();
    if (n && n.addListener) n.addListener("avisoTocado", (d) => { try { if (typeof tab !== "undefined") { tab = d && d.abrir === "inv" ? "inv" : "list"; if (typeof screen !== "undefined") screen = null; render(); } } catch (e) {} });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) leerEstado().then(() => { firma = ""; reprogramar(300); }); });
  }

  return { cfg, guardar, plan, delDia, mensaje, reprogramar, leerEstado, pedirPermiso, probar, ajustesHTML, bindAjustes, iniciar, nativo, permiso: () => permiso, programados: () => programados };
})();
window.Avisos = Avisos;
Avisos.iniciar();
