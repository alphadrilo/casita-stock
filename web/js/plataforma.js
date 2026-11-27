/* Casita Stock — plataforma: conecta la app con Supabase (datos, cuentas, familia) y con la IA (/api/ia).
   Expone window.claude.use(nombre) con la misma forma que usaba la versión dentro de Claude,
   para que el resto de la app no tenga que cambiar. Si no hay configuración, la app corre en modo demo. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ico = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const S = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const nativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const BASE = nativo ? String(window.CS_SERVIDOR || "").replace(/\/+$/, "") : "";
  let motivoDemo = "";
  const esIOS = nativo || /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada = nativo || window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const origen = BASE || location.origin;

  let cfg = null, sb = null, session = null, hogar = null, miembros = [], caps = null, demo = false, fotoSinColumna = false, sin26 = false;
  let listo; const ready = new Promise((r) => (listo = r));
  window.claude = { use: (n) => ready.then(() => (caps ? caps[n] || null : null)) };

  /* ---------------- Pantalla de bienvenida (gate) ---------------- */
  function gate(html) {
    const g = $("#gate"); g.hidden = false; document.body.classList.add("noscroll");
    g.innerHTML = `<div class="gate-in"><div class="brand gate-brand"><img src="/icons/icon-192.png" alt="" width="44" height="44"><h1>Casita Stock</h1></div>${html}</div>`;
    g.scrollTop = 0;
    return g;
  }
  function cerrarGate() { const g = $("#gate"); g.hidden = true; g.innerHTML = ""; document.body.classList.remove("noscroll"); }
  const avisoInstalar = () => (esIOS && !instalada) ? `<div class="notice warn">${ico("alert")}<span><b>Primero instálala:</b> toca el botón Compartir de Safari y luego <b>“Añadir a pantalla de inicio”</b>. Ábrela desde el ícono y entra ahí; así tu sesión queda guardada en la app.</span></div>` : "";

  /* Entrar con correo y contraseña (sin enviar correos: en Supabase, "Confirm email" va apagado) */
  function pasoLogin() {
    return new Promise((fin) => {
      let correo = S.get("cs-correo", "");
      let modo = S.get("cs-correo", "") ? "entrar" : "crear";
      const MSG = (e) => {
        const m = (e && e.message) || "";
        if (/invalid login|invalid credentials/i.test(m)) return "Correo o contraseña incorrectos. Revísalos e intenta otra vez.";
        if (/not confirmed|confirm/i.test(m)) return "Esta cuenta espera confirmación por correo. En Supabase → Authentication → Sign In / Providers → Email, apaga \"Confirm email\" y vuelve a intentarlo.";
        if (/already registered|already exists/i.test(m)) return "Ya hay una cuenta con ese correo. Entra con tu contraseña.";
        if (/password/i.test(m) && /least|short|weak|characters/i.test(m)) return "La contraseña es muy corta: usa al menos 8 letras o números.";
        if (/rate|seconds|too many/i.test(m)) return "Muchos intentos seguidos. Espera un minuto y vuelve a intentarlo.";
        if (/signups? not allowed|disabled/i.test(m)) return "En Supabase está apagado crear cuentas nuevas (Authentication → Sign In / Providers → Allow new users to sign up).";
        return "No se pudo entrar. Revisa tu conexión e intenta otra vez.";
      };
      const pantalla = (msg) => {
        const crear = modo === "crear";
        gate(`<section class="card"><h2 class="gate-h">${crear ? "Crea tu cuenta" : "Bienvenido otra vez"}</h2>
          <p class="lead">${crear ? "Con tu correo y una contraseña. La usarás para entrar desde cualquier teléfono de la casa." : "Entra con tu correo y tu contraseña."}</p>
          ${avisoInstalar()}
          <div class="field"><label for="g-mail">Tu correo</label><input type="email" id="g-mail" autocomplete="username" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(correo)}" placeholder="tu@correo.com"></div>
          <div class="field"><label for="g-pass">${crear ? "Crea una contraseña" : "Contraseña"}</label>
            <div class="row" style="flex-wrap:nowrap"><input type="password" id="g-pass" autocomplete="${crear ? "new-password" : "current-password"}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${crear ? "Al menos 8 letras o números" : "Tu contraseña"}" style="flex:1;min-width:0">
            <button class="btn sm" id="g-ver" type="button" aria-label="Mostrar contraseña" style="flex:0 0 auto">Ver</button></div></div>
          ${msg ? `<div class="notice bad" role="alert">${ico("alert")}<span>${esc(msg)}</span></div>` : ""}
          <button class="btn primary" id="g-go">${crear ? "Crear cuenta" : "Entrar"}</button>
          <button class="linkbtn" id="g-modo">${crear ? "Ya tengo cuenta: entrar" : "Soy nuevo: crear cuenta"}</button>
          ${crear ? "" : `<p class="hint" style="margin:0">¿Olvidaste tu contraseña? Quien administra la app puede cambiarla en Supabase → Authentication → Users.</p>`}</section>`);
        $("#g-ver").onclick = () => { const i = $("#g-pass"); const v = i.type === "password"; i.type = v ? "text" : "password"; $("#g-ver").textContent = v ? "Ocultar" : "Ver"; };
        $("#g-modo").onclick = () => { correo = $("#g-mail").value.trim().toLowerCase(); modo = crear ? "entrar" : "crear"; pantalla(); };
        const go = async () => {
          correo = $("#g-mail").value.trim().toLowerCase();
          const pass = $("#g-pass").value;
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return pantalla("Escribe un correo válido, por ejemplo nombre@gmail.com.");
          if (pass.length < (crear ? 8 : 1)) return pantalla(crear ? "La contraseña es muy corta: usa al menos 8 letras o números." : "Escribe tu contraseña.");
          const b = $("#g-go"); b.disabled = true; b.textContent = crear ? "Creando…" : "Entrando…";
          try {
            const r = crear ? await sb.auth.signUp({ email: correo, password: pass }) : await sb.auth.signInWithPassword({ email: correo, password: pass });
            if (r.error) return pantalla(MSG(r.error));
            if (!r.data.session) return pantalla(MSG({ message: "not confirmed" }));
            // Supabase responde sin error a un correo ya registrado cuando la confirmación está apagada: se detecta por identities vacías
            if (crear && r.data.user && Array.isArray(r.data.user.identities) && !r.data.user.identities.length) { modo = "entrar"; return pantalla(MSG({ message: "already registered" })); }
            S.set("cs-correo", correo); session = r.data.session; fin();
          } catch (e) { pantalla(MSG(e)); }
        };
        $("#g-go").onclick = go;
        $("#g-pass").onkeydown = (e) => { if (e.key === "Enter") go(); };
        $("#g-mail").onkeydown = (e) => { if (e.key === "Enter") $("#g-pass").focus(); };
      };
      pantalla();
    });
  }

  async function cargarHogar() {
    let { data, error } = await sb.from("miembros").select("hogar_id,nombre,rol,hogares(id,nombre,codigo,invitacion)").eq("user_id", session.user.id);
    if (error && /invitacion/.test(String(error.message || ""))) { sin26 = true; ({ data, error } = await sb.from("miembros").select("hogar_id,nombre,rol,hogares(id,nombre,codigo)").eq("user_id", session.user.id)); }
    if (error) { const c = S.get("cs-hogar", null); if (c && c.uid === session.user.id) hogar = c; return; }
    const elegido = S.get("cs-hogar", null);
    const filas = (data || []).filter((m) => m.hogares);
    const m = filas.find((x) => elegido && x.hogar_id === elegido.id) || filas[0];
    hogar = m ? { id: m.hogar_id, nombre: m.hogares.nombre, codigo: m.hogares.codigo, invitacion: m.hogares.invitacion || "", miNombre: m.nombre, rol: m.rol, uid: session.user.id, otros: filas.length } : null;
    if (hogar) S.set("cs-hogar", hogar);
  }
  /* Foto cuadrada y pequeña (192 px, unos 10 KB) para la familia */
  async function fotoCuadrada(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const lado = Math.min(img.naturalWidth, img.naturalHeight), T = 192, c = document.createElement("canvas"); c.width = c.height = T;
      c.getContext("2d").drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, T, T);
      let q = 0.8, out = c.toDataURL("image/jpeg", q); while (out.length > 55000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  async function cargarMiembros() {
    if (!sb || !hogar) return miembros;
    let { data, error } = await sb.from("miembros").select("user_id,nombre,rol,foto").eq("hogar_id", hogar.id);
    if (error && /foto/.test(String(error.message || ""))) { fotoSinColumna = true; ({ data } = await sb.from("miembros").select("user_id,nombre,rol").eq("hogar_id", hogar.id)); }
    if (data) miembros = data;
    return miembros;
  }

  /* ---------------- Familia: invitaciones con aprobación (2.6) ----------------
     El QR lleva un enlace con una clave larga (hogares.invitacion), nunca datos personales. Escanear o escribir el código
     solo crea una solicitud: la persona entra cuando quien administra la casa la aprueba (validado en Supabase). */
  const falta26 = (e) => /solicitar_unirme|ver_invitacion|mi_solicitud|cancelar_solicitud|responder_solicitud|quitar_miembro|desbloquear|solicitudes|bloqueos|invitacion|PGRST202|schema cache/i.test(String((e && (e.message || e.code)) || ""));
  const MSGS_SQL = /^(Esa invitación|No es posible|Ya tienes|Esta casa tiene|Necesitas|Solo quien|No puedes|No se puede|Esa persona)/;
  const msgError = (e, otro) => { const m = String((e && e.message) || ""); return MSGS_SQL.test(m) ? m : /fetch|network|Failed|Load failed/i.test(m) ? "No hay conexión. Revisa internet e inténtalo otra vez." : otro || "No se pudo completar. Inténtalo otra vez."; };
  const enlaceInvitacion = (inv) => `${origen.replace(/\/$/, "")}/?unirme=${encodeURIComponent(inv)}`;
  const limpiarClave = (txt) => { txt = String(txt || "").trim(); const m = txt.match(/[?&]unirme=([A-Za-z0-9]+)/); return (m ? m[1] : txt).replace(/[^A-Za-z0-9]/g, "").slice(0, 40); };
  function qrSVG(texto) {
    if (typeof qrcode !== "function") return "";
    const q = qrcode(0, "M"); q.addData(texto); q.make();
    const n = q.getModuleCount(), m = 2; let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" role="img" aria-label="Código QR para pedir unirse a la casa"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#10231b"/></svg>`;
  }
  async function leerQR(file) {
    if (!file) return "";
    if ("BarcodeDetector" in window) { try { const r = await new BarcodeDetector({ formats: ["qr_code"] }).detect(await createImageBitmap(file)); if (r[0]) return r[0].rawValue; } catch (e) {} }
    if (window.ZXing) { const url = URL.createObjectURL(file); try { return (await new ZXing.BrowserQRCodeReader().decodeFromImageUrl(url)).getText(); } catch (e) {} finally { URL.revokeObjectURL(url); } }
    return "";
  }
  // La invitación del enlace se guarda en el teléfono: sobrevive a crear la cuenta, entrar o cerrar la app
  try { const c = new URLSearchParams(location.search).get("unirme"); if (c) { S.set("cs-invitacion", limpiarClave(c)); history.replaceState(null, "", location.pathname); } } catch (e) {}

  function pasoHogar() {
    return new Promise((fin) => {
      let canalSol = null, reloj = null, alVolver = null, vuelta = 0;
      const parar = () => { vuelta++; if (canalSol) { try { sb.removeChannel(canalSol); } catch (e) {} canalSol = null; } clearInterval(reloj); if (alVolver) document.removeEventListener("visibilitychange", alVolver); alVolver = null; };
      const entrar = async () => { await cargarHogar(); if (!hogar) return false; parar(); S.del("cs-invitacion"); fin(); return true; };
      const campoNombre = () => `<div class="field"><label for="g-yo">¿Cómo te llamas?</label><input type="text" id="g-yo" autocomplete="given-name" maxlength="40" placeholder="Ej.: Levi" value="${esc(S.get("cs-minombre", ""))}"></div>`;
      const yo = () => { const n = ($("#g-yo") ? $("#g-yo").value : "").trim(); if ($("#g-yo")) S.set("cs-minombre", n); return n; };
      const aviso = (msg, ok) => msg ? `<div class="notice ${ok ? "ok" : "bad"}" role="${ok ? "status" : "alert"}">${ico(ok ? "check" : "alert")}<span>${esc(msg)}</span></div>` : "";
      const estado = (icono, clase) => `<div class="g-est ${clase || ""}" aria-hidden="true">${ico(icono)}</div>`;

      async function pedir(clave, n, boton) {
        if (boton) boton.disabled = true;
        const { data, error } = await sb.rpc("solicitar_unirme", { clave, mi_nombre: n });
        if (error && falta26(error)) {   // Supabase todavía sin familia-2-6.sql: se une como antes
          const r = await sb.rpc("unirse_hogar", { codigo_invitacion: clave, mi_nombre: n });
          if (r.error) return { msg: /no existe/i.test(r.error.message) ? "Ese código no existe. Revisa las letras y números." : msgError(r.error, "No se pudo unir. Revisa tu conexión.") };
          await entrar(); return {};
        }
        if (error) { if (/ya no sirve|No es posible/.test(error.message || "")) S.del("cs-invitacion"); return { msg: msgError(error) }; }
        if (data.estado === "miembro") { await entrar(); return {}; }
        S.del("cs-invitacion"); esperando(data.casa); return {};
      }

      // Pantalla: te invitaron (después de escanear el QR o abrir el enlace)
      function invitado(casa, clave, msg) {
        gate(`<section class="card"><div class="g-ctr">${estado("users", "ok")}<h2 class="gate-h">Te invitaron a ${esc(casa)}</h2>
          <p class="lead">Envía tu solicitud. Cuando quien administra la casa la apruebe, verás el inventario y la lista de compras.</p></div>
          ${campoNombre()}${aviso(msg)}
          <button class="btn primary" id="g-pedir">${ico("send")}Solicitar unirme</button>
          <button class="linkbtn" id="g-otra">No, gracias. Quiero crear mi propia casa</button></section>`);
        $("#g-pedir").onclick = async () => { const n = yo(); if (!n) return invitado(casa, clave, "Escribe tu nombre para que sepan quién pide unirse."); const r = await pedir(clave, n, $("#g-pedir")); if (r.msg) invitado(casa, clave, r.msg); };
        $("#g-otra").onclick = () => { S.del("cs-invitacion"); elegir(); };
      }

      // Pantalla: esperando aprobación (la respuesta llega en tiempo real; también se revisa al volver a la app y cada 20 s)
      function esperando(casa, msg) {
        parar();
        gate(`<section class="card"><div class="g-ctr">${estado("clock", "warn")}<h2 class="gate-h">Esperando aprobación</h2>
          <p class="lead">Le avisamos a quien administra <b>${esc(casa)}</b>. Cuando te apruebe, entrarás solo.</p></div>
          ${aviso(msg || "Puedes cerrar la app. Tu solicitud queda guardada.", true)}
          <button class="btn" id="g-rev">${ico("clock")}Revisar ahora</button>
          <button class="linkbtn danger" id="g-can">Cancelar solicitud</button></section>`);
        const mia = vuelta;
        const revisar = async (manual) => {
          if (mia !== vuelta) return;
          let r; try { r = await sb.rpc("mi_solicitud"); } catch (e) { r = { error: e }; }
          if (mia !== vuelta) return;
          if (r.error) { if (manual) esperando(casa, "No hay conexión. Revisa internet e inténtalo otra vez."); return; }
          const d = r.data;
          if (d && d.estado === "aprobada") { S.set("cs-bienvenida", d.casa || casa); if (!(await entrar()) && manual) esperando(casa); return; }
          if (d && d.estado === "rechazada") { parar(); S.set("cs-sol-vista", d.id); return respuesta("rechazada", d.casa || casa); }
          if (!d || d.estado === "cancelada") { parar(); return elegir(); }
          if (manual) esperando(casa, "Todavía no responde. Te avisamos aquí apenas lo haga.");
        };
        $("#g-rev").onclick = () => revisar(true);
        $("#g-can").onclick = async () => { const b = $("#g-can"); if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "Toca otra vez para cancelar"; return; } parar(); await sb.rpc("cancelar_solicitud"); elegir(); };
        try { canalSol = sb.channel("sol-" + session.user.id).on("postgres_changes", { event: "UPDATE", schema: "public", table: "solicitudes", filter: "user_id=eq." + session.user.id }, () => revisar(false)).subscribe(); } catch (e) {}
        reloj = setInterval(() => revisar(false), 20000);
        alVolver = () => { if (document.visibilityState === "visible") revisar(false); }; document.addEventListener("visibilitychange", alVolver);
      }

      // Pantallas: no fue aprobada / ya no formas parte
      function respuesta(tipo, casa) {
        const quitado = tipo === "quitado";
        gate(`<section class="card"><div class="g-ctr">${estado(quitado ? "alert" : "x", "bad")}<h2 class="gate-h">${quitado ? `Ya no formas parte de ${esc(casa)}` : "Tu solicitud no fue aprobada"}</h2>
          <p class="lead">${quitado ? "Quien administra la casa te quitó de ella y borramos de este teléfono los datos de esa casa." : `Quien administra ${esc(casa)} no aprobó tu solicitud. Si crees que es un error, habla con esa persona.`}</p></div>
          <button class="btn primary" id="g-r1">${ico("plus")}Crear mi casa</button>
          <button class="btn" id="g-r2">${ico("users")}Pedir unirme a una casa</button></section>`);
        $("#g-r1").onclick = () => elegir(); $("#g-r2").onclick = () => elegir("", true);
      }

      // Pantalla: crear mi casa o pedir unirme con código o QR
      function elegir(msg, enfocarCodigo, ok) {
        gate(`<section class="card"><h2 class="gate-h">Tu casa</h2>
          <p class="lead">Todos los que se unan a la misma casa ven el mismo inventario y la misma lista de compras.</p>
          ${campoNombre()}${aviso(msg)}
          <button class="btn primary" id="g-new">${ico("plus")}Crear mi casa</button>
          <div class="divider">o si alguien de tu familia ya la creó</div>
          <div class="field"><label for="g-cod">Código de la casa</label><input type="text" id="g-cod" class="code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" placeholder="Ej.: 4F7A2C"></div>
          ${aviso(ok, true)}
          <button class="btn" id="g-join">${ico("send")}Pedir unirme con el código</button>
          <label class="btn" style="position:relative;overflow:hidden">${ico("scan")}Escanear QR de la casa<input type="file" id="g-qr" accept="image/*" capture="environment" aria-label="Escanear QR de la casa" style="position:absolute;inset:0;opacity:0"></label>
          <p class="hint" style="margin:0">Al pedir unirte, quien administra la casa recibe tu solicitud y decide si entras.</p></section>`);
        if (enfocarCodigo) setTimeout(() => $("#g-cod") && $("#g-cod").focus(), 50);
        $("#g-new").onclick = async () => {
          const n = yo(); if (!n) return elegir("Escribe tu nombre para que tu familia sepa quién compró o usó cada cosa.");
          $("#g-new").disabled = true;
          const { error } = await sb.rpc("crear_hogar", { nombre_hogar: `Casa de ${n}`, mi_nombre: n });
          if (error) return elegir("No se pudo crear la casa. Revisa tu conexión e inténtalo otra vez.");
          await entrar();
        };
        $("#g-join").onclick = async () => {
          const n = yo(); const c = limpiarClave($("#g-cod").value);
          if (!n) return elegir("Escribe tu nombre primero.");
          if (c.length < 4) return elegir("Escribe el código que te compartieron.");
          const r = await pedir(c, n, $("#g-join")); if (r.msg) elegir(r.msg);
        };
        $("#g-qr").onchange = async (e) => {
          const f = e.target.files && e.target.files[0]; e.target.value = ""; yo(); if (!f) return;
          const c = limpiarClave(await leerQR(f));
          if (c.length < 4) return elegir("No pude leer el QR. Acércate más, con buena luz, y que se vea completo.");
          S.set("cs-invitacion", c); abrirInvitacion(c);
        };
      }

      async function abrirInvitacion(clave) {
        const { data, error } = await sb.rpc("ver_invitacion", { clave });
        if (error && falta26(error)) { S.del("cs-invitacion"); elegir(); if ($("#g-cod")) $("#g-cod").value = clave.length <= 12 ? clave.toUpperCase() : ""; return; }
        if (error) { if (/ya no sirve/.test(error.message || "")) S.del("cs-invitacion"); return elegir(msgError(error)); }
        if (data.estado === "miembro") { if (!(await entrar())) elegir(); return; }
        if (data.estado === "pendiente") { S.del("cs-invitacion"); return esperando(data.casa); }
        invitado(data.casa, clave);
      }

      (async () => {
        const q = S.get("cs-quitado", null);
        if (q) {   // Me quitaron de una casa: se borra otra vez lo que la app pudo guardar antes de recargar
          ["cs-hogar", "cs5-mirror", q.hid ? "cs-pendientes-" + q.hid : ""].filter(Boolean).forEach(S.del);
          S.del("cs-quitado"); return respuesta("quitado", q.casa || "la casa");
        }
        const inv = S.get("cs-invitacion", "");
        if (inv) return abrirInvitacion(inv);
        try {
          const { data, error } = await sb.rpc("mi_solicitud");
          if (!error && data) {
            if (data.estado === "pendiente") return esperando(data.casa);
            if (data.estado === "rechazada" && S.get("cs-sol-vista", "") !== data.id) { S.set("cs-sol-vista", data.id); return respuesta("rechazada", data.casa); }
          }
        } catch (e) {}
        elegir();
      })();
    });
  }

  const SUGERIDOS = ["Casi", "Lupe", "Tina", "Nico", "Rosa", "Max"];
  const PAIS = { "es-ES": "España", "es-MX": "México", "es-US": "EE. UU.", "es-CO": "Colombia", "es-AR": "Argentina", "es-CL": "Chile", "es-PE": "Perú", "es-419": "Latinoamérica" };
  const etiquetaVoz = (v) => `${v.name} · ${PAIS[v.lang] || PAIS[v.lang.replace("_", "-")] || v.lang}`;
  /* Lista de voces según el personaje: primero las de ese tipo, luego las que no se sabe; nunca las del otro tipo */
  function opcionesVoz(sel) {
    const vs = Voz.voces();
    if (!vs.length) return `<option value="">Voz del teléfono</option>`;
    const g = Voz.personaje(), propias = Voz.vocesDe(g), neutras = vs.filter((v) => !Voz.generoDe(v));
    const actual = (Voz.vozElegida() || {}).name;
    const op = (v) => `<option value="${esc(v.name)}" ${v.name === actual ? "selected" : ""}>${esc(etiquetaVoz(v))}</option>`;
    let h = "";
    if (propias.length) h += `<optgroup label="${g === "hombre" ? "Voces de hombre" : "Voces de mujer"}">${propias.map(op).join("")}</optgroup>`;
    if (neutras.length) h += `<optgroup label="Otras voces">${neutras.map(op).join("")}</optgroup>`;
    if (!h) h = `<option value="">${g === "hombre" ? "Voz más grave" : "Voz del teléfono"}</option>`;
    return h;
  }
  // Aviso cuando el iPhone no tiene voces del tipo del personaje
  function avisoVoces() {
    const g = Voz.personaje();
    if (!Voz.voces().length || Voz.vocesDe(g).length) return "";
    const nombres = g === "hombre" ? "Jorge (España), Juan (México), Diego (Argentina) o Carlos (Colombia)" : "Mónica (España) o Paulina (México)";
    return `<div class="notice warn" id="a-vnota">${icon("alert")}<span><b>Tu iPhone no tiene voces de ${g} en español.</b> Mientras tanto uso una voz ${g === "hombre" ? "más grave" : "del teléfono"}. Para agregar una: <b>Ajustes del iPhone → Accesibilidad → Contenido leído → Voces → Español</b>, descarga ${nombres} y luego cierra y vuelve a abrir Casita Stock.</span></div>`;
  }
  function pasoAsistente() {
    return new Promise((fin) => {
      const c = Voz.cfg();
      gate(`<section class="card"><h2 class="gate-h">Ponle nombre a tu asistente</h2>
        <p class="lead">Es quien te contesta cuando le preguntas o le dices qué compraste. Puedes cambiarlo después en Ajustes.</p>
        <div class="field"><label for="g-an">Nombre del asistente</label><input type="text" id="g-an" maxlength="20" value="${esc(c.nombre)}" placeholder="Ej.: Casi">
          <div class="chips">${SUGERIDOS.map((n) => `<button class="chip sm" data-sug="${n}">${n}</button>`).join("")}</div></div>
        <div class="field"><label for="g-av">Su voz</label><select id="g-av">${opcionesVoz(c.voz)}</select>
          <button class="linkbtn" id="g-try">${ico("send")}Escuchar cómo suena</button></div>
        <button class="btn primary" id="g-ok">${ico("check")}Listo</button></section>`);
      Voz.alCargarVoces(() => { const s = $("#g-av"); if (s) s.innerHTML = opcionesVoz(Voz.cfg().voz || s.value); });
      document.querySelectorAll("[data-sug]").forEach((b) => (b.onclick = () => { $("#g-an").value = b.dataset.sug; }));
      $("#g-try").onclick = () => { const n = $("#g-an").value.trim() || "tu asistente"; Voz.guardar({ voz: $("#g-av").value }); Voz.hablar(`Hola, soy ${n}. ¿Qué compraste hoy?`, true); };
      $("#g-ok").onclick = () => {
        const n = $("#g-an").value.trim();
        if (!n) { $("#g-an").focus(); $("#g-an").placeholder = "Escribe un nombre, por ejemplo Casi"; return; }
        Voz.guardar({ nombre: n, voz: $("#g-av").value });
        window.actualizarNombreAsistente && window.actualizarNombreAsistente();
        fin();
      };
    });
  }

  /* ---------------- Base de datos (misma forma que la versión anterior) ---------------- */
  function hacerDb() {
    const hid = hogar.id;
    const cache = {}; const oyentes = {}; const docOyentes = {};
    let canal = null, cargadas = {}, actSinTabla = false;
    const snapDoc = (id, d) => ({ id, exists: d !== undefined, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } });
    const avisar = (col) => {
      const m = cache[col] || new Map();
      const docs = [...m.entries()].map(([id, d]) => snapDoc(id, d));
      (oyentes[col] || []).forEach((fn) => { try { fn({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }); } catch (e) { console.error(e); } });
      Object.entries(docOyentes).forEach(([k, fns]) => { const [c, id] = k.split("/"); if (c === col) fns.forEach((fn) => { try { fn(snapDoc(id, m.get(id))); } catch (e) { console.error(e); } }); });
    };
    const errDb = (e) => ({ code: e && e.code === "23514" ? "check_violation" : e && e.code === "42501" ? "invalid_argument" : /fetch|network|Failed/i.test(String(e && e.message)) ? "unavailable" : "invalid_argument", message: String((e && e.message) || e) });
    /* ---- Cambios sin conexión (desde 2.3): se guardan en el teléfono y se suben solos al volver la señal ---- */
    const PK = "cs-pendientes-" + hid;
    let cola = (() => { try { return JSON.parse(localStorage.getItem(PK) || "[]"); } catch (e) { return []; } })(), subiendo = false;
    const esRed = (e) => !navigator.onLine || /fetch|network|Failed|Load failed|NetworkError|timed? ?out|ECONN|abort/i.test(String((e && (e.message || e.details)) || e));
    const guardarCola = () => { try { localStorage.setItem(PK, JSON.stringify(cola)); } catch (e) {} window.dispatchEvent(new CustomEvent("cs-pendientes", { detail: cola.length })); };
    /* extra: {delta, hist} para productos (2.5): al subir se suma a lo que haya en la nube en vez de pisarlo */
    const encolar = (col, id, op, data, extra) => {
      const viejo = cola.find((x) => x.col === col && x.id === id && x.op === "set");
      if (extra && viejo && viejo.merge && op === "set") extra = { delta: viejo.merge.delta + extra.delta, hist: [...viejo.merge.hist, ...extra.hist] };
      if (op === "act") { if (cola.some((x) => x.op === "act" && x.id === id)) return; cola.push({ col, id, op, data, deps: extra || [], t: Date.now() }); guardarCola(); return; }
      cola = cola.filter((x) => !(x.col === col && x.id === id && x.op !== "act")); cola.push({ col, id, op, data, merge: extra || null, t: Date.now() }); guardarCola();
    };
    const claveH = (h) => JSON.stringify([h.t, h.n, h.f, h.u || "", h.cid || "", h.s || "", h.ts || ""]);
    function fusionar(servidor, x) {
      if (!servidor || !x.merge) return x.data;
      const vistos = new Set((servidor.historial || []).map(claveH));
      const hist = [...(servidor.historial || []), ...x.merge.hist.filter((h) => !vistos.has(claveH(h)))].slice(-40);
      return { ...x.data, cantidad: Math.max(0, Math.round(((+servidor.cantidad || 0) + x.merge.delta) * 1000) / 1000), historial: hist };
    }
    const aplicarCola = (col) => { const m = cache[col] || (cache[col] = new Map()); cola.filter((x) => x.col === col).forEach((x) => { if (x.op === "del") m.delete(x.id); else m.set(x.id, x.data); }); };
    async function escribir(x) {
      try {
        if (x.op === "act") {
          const { error } = await sb.from("actividad").upsert({ ...x.data, hogar_id: hid }, { onConflict: "id", ignoreDuplicates: true });
          if (error && /actividad/.test(String(error.message || "")) && /exist|find|schema cache/i.test(String(error.message || ""))) { actSinTabla = true; return null; }
          return error || null;
        }
        if (x.op === "set" && x.merge && x.col === "productos") {
          let srv = null;
          try { const r = await sb.from("documentos").select("data").eq("hogar_id", hid).eq("coleccion", x.col).eq("id", x.id).maybeSingle(); if (r.error) return r.error; srv = r.data ? r.data.data : null; } catch (e) { return e; }
          const data = fusionar(srv, x);
          if (data !== x.data) { x.data = data; (cache[x.col] || (cache[x.col] = new Map())).set(x.id, data); avisar(x.col); }
        }
        const { error } = x.op === "del"
          ? await sb.from("documentos").delete().eq("hogar_id", hid).eq("coleccion", x.col).eq("id", x.id)
          : await sb.from("documentos").upsert({ hogar_id: hid, coleccion: x.col, id: x.id, data: x.data, actualizado: new Date(x.t || Date.now()).toISOString() });
        return error || null;
      } catch (e) { return e || { message: "network" }; }
    }
    async function subir() {
      if (subiendo || !cola.length) return; subiendo = true; let subidos = 0;
      try {
        while (cola.length) {
          const x = cola[0], error = await escribir(x);
          if (error && esRed(error)) break;
          cola.shift();
          if (error && x.op !== "act") { const k = x.col + "/" + x.id; cola = cola.filter((y) => !(y.op === "act" && (y.deps || []).includes(k))); }   // sin la operación, no hay actividad
          guardarCola();
          if (error) window.dispatchEvent(new CustomEvent("cs-pendiente-rechazado", { detail: { col: x.col, id: x.id, code: errDb(error).code } }));
          else subidos++;
        }
      } finally { subiendo = false; }
      if (subidos && !cola.length) window.dispatchEvent(new CustomEvent("cs-pendientes-subidos", { detail: subidos }));
    }
    async function cargar(col) {
      const { data, error } = await sb.from("documentos").select("id,data").eq("hogar_id", hid).eq("coleccion", col);
      if (error) throw error;
      cache[col] = new Map((data || []).map((r) => [r.id, r.data]));
      aplicarCola(col);
      cargadas[col] = true; avisar(col);
    }
    async function cargarConReintento(col) {
      try { await cargar(col); } catch (e) { setTimeout(() => cargarConReintento(col), 10000); }
    }
    function conectar() {
      if (canal) return;
      canal = sb.channel("casa-" + hid)
        .on("postgres_changes", { event: "*", schema: "public", table: "documentos", filter: "hogar_id=eq." + hid }, (p) => {
          const row = p.eventType === "DELETE" ? p.old : p.new; if (!row || !row.coleccion) return;
          const m = cache[row.coleccion] || (cache[row.coleccion] = new Map());
          if (p.eventType === "DELETE") m.delete(row.id); else m.set(row.id, row.data);
          avisar(row.coleccion);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "actividad", filter: "hogar_id=eq." + hid }, (p) => {
          if (p.new) window.dispatchEvent(new CustomEvent("cs-actividad", { detail: p.new }));
        })
        .subscribe((st) => { if (st === "SUBSCRIBED") Object.keys(cargadas).forEach((c) => cargarConReintento(c)); });
    }
    const refrescar = async () => { await subir(); Object.keys(cargadas).forEach((c) => cargarConReintento(c)); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refrescar(); });
    window.addEventListener("online", refrescar);
    setInterval(() => { if (cola.length) subir(); }, 30000);
    if (cola.length) setTimeout(subir, 1500);

    const docRef = (col, id) => ({
      id, path: col + "/" + id,
      async get() {
        const pend = cola.find((x) => x.col === col && x.id === id);
        if (pend) return snapDoc(id, pend.op === "del" ? undefined : pend.data);
        let data, error;
        try { ({ data, error } = await sb.from("documentos").select("data").eq("hogar_id", hid).eq("coleccion", col).eq("id", id).maybeSingle()); } catch (e) { error = e; }
        if (error && esRed(error)) return snapDoc(id, cache[col] && cache[col].get(id));
        if (error) throw errDb(error);
        return snapDoc(id, data ? data.data : undefined);
      },
      async set(body) {
        const prev = cache[col] && cache[col].get(id);
        (cache[col] || (cache[col] = new Map())).set(id, body); avisar(col);
        const ex = col === "productos" && prev && isFinite(+prev.cantidad) && isFinite(+body.cantidad)
          ? { delta: +body.cantidad - +prev.cantidad, hist: (body.historial || []).filter((h) => !new Set((prev.historial || []).map(claveH)).has(claveH(h))) } : null;
        if (cola.length) { encolar(col, id, "set", body, ex); subir(); return; }
        const error = await escribir({ col, id, op: "set", data: body });
        if (error && esRed(error)) { encolar(col, id, "set", body, ex); return; }
        if (error) { if (prev === undefined) cache[col].delete(id); else cache[col].set(id, prev); avisar(col); throw errDb(error); }
      },
      async update(body) { const s = await this.get(); if (!s.exists) throw { code: "invalid_argument", message: "No existe" }; return this.set({ ...s.data(), ...body }); },
      async delete() {
        const prev = cache[col] && cache[col].get(id);
        if (cache[col]) { cache[col].delete(id); avisar(col); }
        if (cola.length) { encolar(col, id, "del"); subir(); return; }
        const error = await escribir({ col, id, op: "del" });
        if (error && esRed(error)) { encolar(col, id, "del"); return; }
        if (error) { if (prev !== undefined) { cache[col].set(id, prev); avisar(col); } throw errDb(error); }
      },
      onSnapshot(next) {
        const k = col + "/" + id; (docOyentes[k] || (docOyentes[k] = [])).push(next);
        conectar(); if (!cargadas[col]) { cargadas[col] = true; cargarConReintento(col); } else next(snapDoc(id, cache[col] && cache[col].get(id)));
        return () => { docOyentes[k] = (docOyentes[k] || []).filter((f) => f !== next); };
      },
      collection() { throw new TypeError("Subcolecciones no disponibles"); },
    });
    const colRef = (col) => ({
      path: col,
      doc: (id) => docRef(col, id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      async add(body) { const r = docRef(col, Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); await r.set(body); return r; },
      async get() {
        const { data, error } = await sb.from("documentos").select("id,data").eq("hogar_id", hid).eq("coleccion", col);
        if (error) throw errDb(error);
        const docs = (data || []).map((r) => snapDoc(r.id, r.data));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
      },
      onSnapshot(next) {
        (oyentes[col] || (oyentes[col] = [])).push(next);
        conectar(); if (!cargadas[col]) { cargadas[col] = true; cargarConReintento(col); } else avisar(col);
        return () => { oyentes[col] = (oyentes[col] || []).filter((f) => f !== next); };
      },
      where() { return this; }, orderBy() { return this; }, limit() { return this; },
    });
    return {
      collection: (p) => colRef(p),
      pendientes: () => cola.filter((x) => x.op !== "act").length,
      /* Actividad familiar (2.5): se registra DESPUÉS de guardar; si la operación está en la cola, va detrás de ella */
      actividad: {
        sinTabla: () => actSinTabla,
        async registrar(row, deps = []) {
          if (actSinTabla) return;
          if (cola.length || !navigator.onLine) { encolar("__act", row.id, "act", row, deps); subir(); return; }
          const error = await escribir({ op: "act", id: row.id, data: row });
          if (error && esRed(error)) encolar("__act", row.id, "act", row, deps);
        },
        async listar(limite = 80) {
          let filas = [];
          try {
            const { data, error } = await sb.from("actividad").select("*").eq("hogar_id", hid).order("creado", { ascending: false }).limit(limite);
            if (error) { if (/actividad/.test(String(error.message || "")) && /exist|find|schema cache/i.test(String(error.message || ""))) actSinTabla = true; else if (!esRed(error)) throw error; }
            else filas = data || [];
          } catch (e) { if (!esRed(e)) throw e; }
          const pend = cola.filter((x) => x.op === "act" && !filas.some((f) => f.id === x.id)).map((x) => ({ ...x.data, hogar_id: hid, user_id: session.user.id, creado: new Date(x.t).toISOString(), pendiente: true }));
          return [...pend, ...filas];
        },
      },
      subir,
      doc: (p) => { const [c, id] = String(p).split("/"); return docRef(c, id); },
      async importar(datos) {
        const filas = [];
        for (const col of ["productos", "lista", "compras"]) for (const [id, d] of Object.entries((datos && datos[col]) || {})) filas.push({ hogar_id: hid, coleccion: col, id, data: d, actualizado: new Date().toISOString() });
        for (let i = 0; i < filas.length; i += 50) { const { error } = await sb.from("documentos").upsert(filas.slice(i, i + 50)); if (error) throw errDb(error); }
        await Promise.all(["productos", "lista", "compras"].map((c) => cargar(c).catch(() => {})));
        return filas.length;
      },
      async exportar() {
        const { data, error } = await sb.from("documentos").select("coleccion,id,data").eq("hogar_id", hid);
        if (error) throw errDb(error);
        const out = { version: 1, exportado: new Date().toISOString().slice(0, 10), productos: {}, lista: {}, compras: {} };
        (data || []).forEach((r) => { if (out[r.coleccion]) out[r.coleccion][r.id] = r.data; });
        return out;
      },
    };
  }

  /* ---------------- Memoria de Lilu (tabla "memorias", con RLS por casa y por persona) ---------------- */
  function hacerMemoria() {
    const hid = hogar.id, yo = session.user.id;
    const err = (e) => ({ code: e && (e.code === "42P01" || e.code === "PGRST205" || /memorias/.test(String(e.message || "")) && /exist|find|schema cache/i.test(String(e.message || ""))) ? "sin_tabla"
      : /fetch|network|Failed/i.test(String(e && e.message)) ? "sin_red" : "error", message: e && e.message });
    const fila = (r) => ({ id: r.id, texto: r.texto, tipo: r.tipo, ambito: r.ambito, activo: r.activo, mio: r.user_id === yo, autor: r.user_id, creado: r.creado, actualizado: r.actualizado });
    return {
      async listar() { const { data, error } = await sb.from("memorias").select("*").eq("hogar_id", hid).order("actualizado", { ascending: false }); if (error) throw err(error); return (data || []).map(fila); },
      async crear({ texto, tipo, ambito }) { const { data, error } = await sb.from("memorias").insert({ hogar_id: hid, user_id: yo, texto, tipo, ambito }).select().single(); if (error) throw err(error); return fila(data); },
      async cambiar(id, c) { const { data, error } = await sb.from("memorias").update({ ...c, actualizado: new Date().toISOString() }).eq("id", id).eq("hogar_id", hid).select().single(); if (error) throw err(error); return fila(data); },
      async borrar(id) { const { error } = await sb.from("memorias").delete().eq("id", id).eq("hogar_id", hid); if (error) throw err(error); },
    };
  }

  /* ---------------- Personas ---------------- */
  function hacerUser() {
    return {
      isOwner: () => hogar && hogar.rol === "dueño", canEdit: () => true, can: async () => true,
      id: async () => session.user.id,
      me: async () => ({ id: session.user.id, name: hogar.miNombre || "" }),
      name: async () => hogar.miNombre || "",
      async profiles(ids) {
        if (!miembros.length) await cargarMiembros();
        const out = {}; [].concat(ids).forEach((id) => { const m = miembros.find((x) => x.user_id === id); out[id] = { id, name: m ? m.nombre : "", foto: (m && m.foto) || "" }; });
        return out;
      },
      /* Fotos de la familia (2.6) */
      async familia(recargar) { if (recargar || !miembros.length) await cargarMiembros(); return miembros.map((m) => ({ id: m.user_id, name: m.nombre || "", foto: m.foto || "", rol: m.rol })); },
      fotoSinColumna: () => fotoSinColumna,
      async guardarFoto(foto) {
        const { error } = await sb.from("miembros").update({ foto: foto || null }).eq("hogar_id", hogar.id).eq("user_id", session.user.id);
        if (error) { if (/foto/.test(String(error.message || ""))) { fotoSinColumna = true; throw { code: "sin_columna" }; } throw errDb(error); }
        const m = miembros.find((x) => x.user_id === session.user.id); if (m) m.foto = foto || null;
        window.dispatchEvent(new CustomEvent("cs-fotos"));
      },
    };
  }

  /* ---------------- IA (pasa por /api/ia; la llave nunca llega al teléfono) ---------------- */
  function hacerSample() {
    const memo = new Map();
    const blobB64 = (b) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = no; r.readAsDataURL(b); });
    async function llamar(payload, signal) {
      const { data } = await sb.auth.getSession();
      const tok = data.session && data.session.access_token;
      let r;
      try {
        r = await fetch(BASE + "/api/ia", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: JSON.stringify(payload), signal });
      } catch (e) { if (e && e.name === "AbortError") throw { code: "cancelled", message: "Detenido" }; throw { code: "upstream_error", message: "Sin conexión" }; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw { code: (j.error && j.error.code) || "upstream_error", message: (j.error && j.error.message) || "Error" };
      return j;
    }
    function mensajes(input) {
      const arr = typeof input === "string" ? [{ role: "user", content: input }] : input;
      const out = [];
      for (const m of arr) {
        const content = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
        const last = out[out.length - 1];
        if (last && last.role === m.role) last.content.push(...content); else out.push({ role: m.role, content: [...content] });
      }
      return out;
    }
    async function sample(input, opts = {}) {
      const tier = opts.modelTier || "default";
      const msgs = mensajes(input);
      const imgs = opts.images ? [].concat(opts.images instanceof FileList ? [...opts.images] : opts.images) : [];
      // opts.files: fotos y PDF en orden (facturas de varias páginas). Los PDF van como "document".
      const archivos = opts.files ? [].concat(opts.files) : [];
      if (imgs.length || archivos.length) {
        const last = [...msgs].reverse().find((m) => m.role === "user");
        const bloque = async (b) => /pdf/.test(b.type)
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: await blobB64(b) } }
          : { type: "image", source: { type: "base64", media_type: /png|webp|gif/.test(b.type) ? b.type : "image/jpeg", data: await blobB64(b) } };
        const partes = await Promise.all([...imgs, ...archivos].map(bloque));
        last.content.unshift(...partes);
      }
      const tools = Array.isArray(opts.tools) ? opts.tools : null;
      const clave = !tools && !imgs.length && !archivos.length && opts.cache !== false ? JSON.stringify([msgs, tier, opts.json ? 1 : 0]) : null;
      const vida = (opts.cache && opts.cache.gcTime) || 300000;
      if (clave && !(opts.cache && opts.cache.refresh)) { const h = memo.get(clave); if (h && Date.now() - h.t < vida) { opts.onText && opts.onText({ text: h.text, delta: h.text }); return { text: h.text, truncated: false, modelTierApplied: tier }; } }
      let texto = "", truncado = false;
      const emitir = (nuevo) => { if (!nuevo) return; const delta = (texto ? "\n\n" : "") + nuevo; texto += delta; opts.onText && opts.onText({ text: texto, delta }); };
      for (let ronda = 0; ronda < 6; ronda++) {
        if (opts.signal && opts.signal.aborted) throw { code: "cancelled", message: "Detenido", text: texto || undefined };
        const payload = { tier, messages: msgs };
        if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
        if (tools) payload.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: "object", properties: {} } }));
        let j;
        try { j = await llamar(payload, opts.signal); } catch (e) { if (texto) e.text = texto; throw e; }
        const bloques = j.content || [];
        emitir(bloques.filter((b) => b.type === "text").map((b) => b.text).join("").trim());
        truncado = j.stop_reason === "max_tokens";
        const usos = bloques.filter((b) => b.type === "tool_use");
        if (j.stop_reason !== "tool_use" || !usos.length || !tools) break;
        msgs.push({ role: "assistant", content: bloques });
        const resultados = [];
        for (const u of usos) {
          const t = tools.find((x) => x.name === u.name);
          let content, is_error = false;
          try {
            if (!t) throw new Error("Herramienta desconocida");
            const r = await t.execute(u.input || {}, { signal: opts.signal || new AbortController().signal });
            content = typeof r === "string" ? r : JSON.stringify(r ?? null);
          } catch (e) { content = "Error: " + ((e && e.message) || e); is_error = true; }
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: String(content).slice(0, 32000), is_error });
        }
        msgs.push({ role: "user", content: resultados });
      }
      if (!texto.trim()) throw { code: "empty_completion", message: "La IA no respondió" };
      if (clave) memo.set(clave, { t: Date.now(), text: texto });
      return { text: texto, truncated: truncado, modelTierApplied: tier };
    }
    function parse(t) {
      try { return JSON.parse(t); } catch (e) {}
      // Arreglos comunes: comas sobrantes antes de } o ], y comillas tipográficas
      const limpio = String(t).replace(/[\u201c\u201d]/g, '"').replace(/,\s*([}\]])/g, "$1");
      if (limpio !== t) { try { return parse(limpio); } catch (e) {} }
      const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
      const ia = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0); const a = ia.length ? Math.min(...ia) : -1;
      const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
      if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
      throw { code: "invalid_json", message: "Respuesta no válida", text: t };
    }
    sample.json = async (input, opts = {}) => {
      const extra = "\n\nResponde únicamente con el JSON pedido, sin texto antes ni después.";
      const inp = typeof input === "string" ? input + extra : input.map((m, i) => i === input.length - 1 ? { ...m, content: m.content + extra } : m);
      // Si la respuesta se corta o no es JSON válido, se pide una vez más, más corta y con más espacio.
      const pedir = async (inp2, o) => { const r = await sample(inp2, o); if (r.truncated) throw { code: "invalid_json", message: "Respuesta incompleta", text: r.text }; return parse(r.text); };
      const o1 = { ...opts, json: true, maxTokens: opts.maxTokens || 4000 };
      try { return await pedir(inp, o1); }
      catch (e) {
        if (!e || e.code !== "invalid_json" || (opts.signal && opts.signal.aborted)) throw e;
        const corto = "\n\nTu respuesta anterior se cortó o no era JSON válido. Responde de nuevo SOLO con el JSON, con frases más cortas y sin comillas dentro del texto.";
        const inp2 = typeof inp === "string" ? inp + corto : inp.map((m, i) => i === inp.length - 1 ? { ...m, content: m.content + corto } : m);
        return pedir(inp2, { ...o1, maxTokens: Math.min(8000, (o1.maxTokens || 4000) * 2), cache: false });
      }
    };
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 20, maxInputBytes: 20e6, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] }, documents: { mediaTypes: ["application/pdf"], maxBytes: 3e6 }, maxBodyBytes: 4.2e6, tools: { maxCount: 10 } });
    return sample;
  }

  /* ---------------- Descargas ---------------- */
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.json$/.test(filename) ? "application/json" : "text/csv;charset=utf-8" });
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); return { status: "delivered" }; }
        catch (e) { if (e && e.name === "AbortError") throw { code: "declined" }; }
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return { status: "saved" };
    },
  };

  /* ---------------- Ajustes ---------------- */
  function ajustesHTML() {
    const c = Voz.cfg();
    const fam = demo ? `<div class="notice warn">${ico("alert")}<span><b>Modo demo.</b> Los datos se guardan solo en este teléfono y la IA está apagada. ${motivoDemo ? `<br><b>Por qué:</b> ${esc(motivoDemo)}` : "Sigue la guía de instalación para conectar Supabase y Claude."}</span></div>
      ${BASE || !nativo ? `<button class="btn sm" id="a-retry">Probar la conexión otra vez</button>` : ""}`
      : `<section class="card"><span class="aitag g">${ico("users")}Tu casa</span>
        <div class="field"><label for="a-casa">Nombre de la casa</label><input type="text" id="a-casa" value="${esc(hogar.nombre)}"></div>
        ${esAdmin() && !sin26 ? `<div class="field" id="a-solwrap" hidden><span class="lbl">Solicitudes pendientes <span class="cnt" id="a-soln"></span></span><div id="a-sol" class="sol-lista"></div></div>` : ""}
        <div class="field"><span class="lbl">Invitar a tu familia</span><div class="big-num" style="font-family:var(--mono);letter-spacing:.12em">${esc(hogar.codigo)}</div>
          <p class="hint" style="margin:0">${sin26 ? "Quien instale la app entra con su correo, elige “Unirme con el código” y escribe este código." : `Con el QR o el código, la persona <b>pide</b> unirse. ${esAdmin() ? "Nadie entra hasta que tú lo apruebes." : "Entra cuando quien administra la casa lo apruebe."}`}</p>
          <div class="row">${!sin26 && hogar.invitacion ? `<button class="btn sm primary" id="a-qr">${ico("scan")}Mostrar QR</button>` : ""}<button class="btn sm" id="a-share">${ico("send")}Compartir código</button>${esAdmin() || sin26 ? `<button class="btn sm" id="a-newcode">Cambiar código</button>` : ""}</div></div>
        <div class="field"><span class="lbl">Quiénes están</span><ul class="list" id="a-fam"><li><span class="hint">Cargando…</span></li></ul></div>
        ${esAdmin() && !sin26 ? `<div class="field" id="a-bloqwrap" hidden><span class="lbl">Bloqueados</span><ul class="list" id="a-bloq"></ul></div>` : ""}
        <div class="field"><span class="lbl">Tu foto</span><div class="yo-foto"><span id="a-fav">${window.Actividad ? Actividad.avatar(session.user.id, hogar.miNombre, "xl") : ""}</span>
          <div class="yo-acc"><label class="btn sm" style="position:relative">${ico("cam")}Tomar foto<input type="file" id="a-fcam" accept="image/*" capture="user" style="position:absolute;inset:0;opacity:0"></label>
          <label class="btn sm" style="position:relative">${ico("image")}Elegir foto<input type="file" id="a-fgal" accept="image/*" style="position:absolute;inset:0;opacity:0"></label>
          <button class="linkbtn danger" id="a-fdel" hidden>Quitar foto</button></div></div>
          <p class="hint" style="margin:0">La ven solo las personas de tu casa, en los avisos y en la actividad.</p></div>
        <div class="field"><label for="a-yo">Tu nombre</label><input type="text" id="a-yo" value="${esc(hogar.miNombre || "")}"></div></section>`;
    return `<div class="sheet-wrap" id="a-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="a-t">
      <div class="grab" aria-hidden="true"></div>
      <div class="top"><h2 id="a-t">Ajustes</h2><button class="x" id="a-x" aria-label="Cerrar">${ico("close")}</button></div>
      <section class="card ai"><span class="aitag">${ico("mic")}Tu asistente</span>
        <div class="field"><label for="a-an">Nombre</label><input type="text" id="a-an" maxlength="20" value="${esc(c.nombre)}"></div>
        <div class="field"><span class="lbl" id="a-pl">Personaje y tipo de voz</span>
          <div class="av-opc" role="radiogroup" aria-labelledby="a-pl">${[["mujer", "Mujer"], ["hombre", "Hombre"]].map(([g, l]) => `<button type="button" role="radio" data-apj="${g}" aria-checked="${Voz.personaje() === g}"><img class="av-img" src="${Voz.imagen(g)}" alt="" width="420" height="415">${l}</button>`).join("")}</div></div>
        <div class="field"><label for="a-av">Voz</label><select id="a-av">${opcionesVoz(c.voz)}</select><div id="a-vaviso">${avisoVoces()}</div><button class="linkbtn ai" id="a-try">Escuchar cómo suena</button></div>
        <div class="field"><label for="a-id">Idioma para escucharte</label><select id="a-id">${[["es-US", "Español (Estados Unidos)"], ["es-MX", "Español (México)"], ["es-CO", "Español (Colombia)"], ["es-ES", "Español (España)"]].map(([v, l]) => `<option value="${v}" ${v === c.idioma ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><span class="lbl">¿Cómo te atiende ${esc(c.nombre || "tu asistente")}?</span>
          <div class="ml-opc" role="radiogroup">
            <label class="${c.modo !== "texto" ? "on" : ""}" data-amod="voz" role="radio" aria-checked="${c.modo !== "texto"}" tabindex="0"><span class="r"></span><span><b>Solo voz (manos libres)</b><span class="h">Habla y te responde en voz alta. En pantalla ves solo lo que entendió y lo que va a guardar.</span></span></label>
            <label class="${c.modo === "texto" ? "on" : ""}" data-amod="texto" role="radio" aria-checked="${c.modo === "texto"}" tabindex="0"><span class="r"></span><span><b>Voz y texto</b><span class="h">Además muestra toda la conversación escrita, como un chat.</span></span></label>
          </div><p class="hint" style="margin:0">En los dos modos, nada se guarda sin tu “sí”.</p></div>
        <button class="check" id="a-hablar" aria-pressed="${c.hablar}"><span class="box">${ico("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Contestar en voz alta</span><br><span class="cm">En “Voz y texto”, lee sus respuestas con la voz elegida. En “Solo voz” siempre habla.</span></span><span></span></button>
        <button class="check" id="a-cont" aria-pressed="${c.continuo}"><span class="box">${ico("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Conversación continua</span><br><span class="cm">Después de responder, vuelve a escucharte. Di “gracias” para terminar.</span></span><span></span></button>
      </section>
      ${window.Avisos ? `<div id="av-host">${Avisos.ajustesHTML()}</div>` : ""}
      ${window.Memoria ? Memoria.ajustesHTML() : ""}
      ${fam}
      <section class="card"><span class="aitag g">${ico("box")}Tus datos</span>
        <label class="btn sm" style="position:relative">${ico("plus")}Importar una copia (.json)<input type="file" id="a-imp" accept=".json,application/json" style="position:absolute;inset:0;opacity:0"></label>
        <button class="btn sm" id="a-exp">${ico("down")}Guardar una copia</button>
        <p class="hint" style="margin:0">Usa “Importar” para traer tus productos de la versión anterior con el archivo importar.json.</p></section>
      ${!instalada ? `<section class="card"><span class="aitag g">${ico("plus")}Instalar en el teléfono</span><p class="lead" style="margin:0">En iPhone: abre esta página en Safari, toca Compartir y luego “Añadir a pantalla de inicio”.</p></section>` : ""}
      <section class="card"><span class="aitag g">${ico("mic")}Llamarlo con Siri</span><p class="lead" style="margin:0">${nativo ? `En la app Atajos crea un atajo con la acción <b>Abrir app → Casita Stock</b> y ponle de nombre <b>${esc(c.nombre || "tu asistente")}</b>. Así dices “Oye Siri, ${esc(c.nombre || "tu asistente")}”, se abre la app y tocas el micrófono.` : `En la app Atajos crea un atajo que abra <b>${esc(origen)}/?hablar=1</b> y ponle de nombre <b>${esc(c.nombre || "tu asistente")}</b>. Así puedes decir “Oye Siri, ${esc(c.nombre || "tu asistente")}” y se abre listo para escucharte.`}</p></section>
      ${!demo ? `<section class="card"><span class="hint">Entraste como ${esc(session.user.email || "")}</span><button class="btn sm danger" id="a-out">Cerrar sesión</button></section>` : ""}
      <p class="hint" style="text-align:center;margin:0">Casita Stock 2.6${nativo ? " · app de iPhone" : ""}</p>
    </div></div>`;
  }
  const esAdmin = () => !!hogar && hogar.rol === "dueño";
  const hace = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return !iso ? "" : m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  function filaMiembros(fam) {
    return fam.map((m) => { const yo = m.user_id === session.user.id, adm = m.rol === "dueño";
      return `<li class="mi-fila">${window.Actividad ? Actividad.avatar(m.user_id, m.nombre, "md") : `<span class="ico g">${ico("users")}</span>`}<div><b>${esc(m.nombre || "Sin nombre")}${yo ? " (tú)" : ""}${adm ? ` <span class="rolt">Administrador</span>` : ""}</b><span>${adm ? "Creó la casa" : "Miembro"}</span></div>${esAdmin() && !sin26 && !yo && !adm ? `<button class="mas" data-quitar="${esc(m.user_id)}" aria-label="Opciones de ${esc(m.nombre || "este miembro")}">⋯</button>` : ""}</li>`; }).join("");
  }
  function hojaSimple(html) {
    const h = document.createElement("div"); h.className = "hoja-fam";
    h.innerHTML = `<div class="sheet-wrap" data-scrim><div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div><div class="top"><span></span><button class="x" data-cerrar aria-label="Cerrar">${ico("close")}</button></div>${html}</div></div>`;
    document.body.append(h); const cerrar = () => h.remove();
    h.querySelector("[data-cerrar]").onclick = cerrar; h.querySelector("[data-scrim]").onclick = (e) => { if (e.target.hasAttribute("data-scrim")) cerrar(); };
    return { h, cerrar };
  }
  function hojaQR() {
    const url = enlaceInvitacion(hogar.invitacion);
    const { h, cerrar } = hojaSimple(`<div class="g-ctr"><h2>Invitar a ${esc(hogar.nombre)}</h2><p class="lead">Que tu familiar lo escanee con la cámara del teléfono.</p></div>
      <div class="qrg" id="q-img">${qrSVG(url)}</div>
      <div class="notice ok">${ico("check")}<span>${esAdmin() ? "<b>Tú decides quién entra.</b> Escanear el QR solo envía una solicitud. Te avisamos para que la apruebes o la rechaces." : "Escanear el QR solo envía una solicitud. Quien administra la casa decide si entra."}</span></div>
      <button class="btn primary" id="q-share">${ico("send")}Compartir enlace</button>
      <p class="hint g-ctr" style="margin:0">Si se cambia el código, este QR y el enlace dejan de servir.</p>`);
    h.querySelector("#q-share").onclick = async () => {
      const t = `Te invito a nuestra casa en Casita Stock. Abre este enlace, entra con tu correo y toca “Solicitar unirme”: ${url}`;
      try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toastP("Enlace copiado"); } } catch (e) {}
    };
    return cerrar;
  }
  function hojaQuitar(m, luego) {
    if (!m) return;
    const nom = esc(m.nombre || "esta persona");
    let bloquear = false;
    const { h, cerrar } = hojaSimple(`<div class="g-ctr">${window.Actividad ? Actividad.avatar(m.user_id, m.nombre, "xl") : ""}<h2 style="margin-top:8px">¿Qué hacemos con ${nom}?</h2></div>
      <div role="radiogroup" aria-label="Qué hacer">
        <button class="opc on" role="radio" aria-checked="true" data-op="quitar"><span class="rd" aria-hidden="true"></span><span><b>Quitar de la casa</b><span>Deja de ver el inventario, la lista y la actividad. Más adelante podría volver a pedir unirse y tú decides.</span></span></button>
        <button class="opc" role="radio" aria-checked="false" data-op="bloquear"><span class="rd" aria-hidden="true"></span><span><b>Quitar y bloquear</b><span>Además, no podrá volver a pedir unirse a ${esc(hogar.nombre)}, aunque tenga el código o el QR.</span></span></button>
      </div>
      <p class="hint" style="margin:0">Lo que ${nom} agregó o compró se queda en la casa.${" "}Puedes desbloquear cuando quieras.</p>
      <button class="btn danger" id="q-ok">${ico("trash")}Quitar a ${nom}</button><button class="btn" data-cerrar2>Cancelar</button>`);
    const ok = h.querySelector("#q-ok");
    h.querySelectorAll("[data-op]").forEach((b) => (b.onclick = () => {
      bloquear = b.dataset.op === "bloquear";
      h.querySelectorAll("[data-op]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
      ok.innerHTML = `${ico("trash")}${bloquear ? `Quitar y bloquear a ${nom}` : `Quitar a ${nom}`}`;
    }));
    h.querySelector("[data-cerrar2]").onclick = cerrar;
    ok.onclick = async () => {
      ok.disabled = true;
      const { error } = await sb.rpc("quitar_miembro", { h: hogar.id, quien: m.user_id, bloquear });
      if (error) { ok.disabled = false; return toastP(msgError(error)); }
      cerrar(); toastP(bloquear ? `${m.nombre || "La persona"} ya no está en la casa y quedó bloqueada` : `${m.nombre || "La persona"} ya no está en la casa`); luego && luego();
    };
  }

  /* Avisos de solicitudes para quien administra + vigilar si me quitaron de la casa */
  const Familia = (() => {
    let canal = null, pendientes = 0;
    const AV = () => "cs-sol-avisadas-" + (session ? session.user.id : "");
    async function solicitudes() {
      if (!esAdmin() || sin26 || demo) return [];
      const { data, error } = await sb.from("solicitudes").select("id,user_id,nombre,correo,via,creado").eq("hogar_id", hogar.id).eq("estado", "pendiente").order("creado", { ascending: true });
      if (error) { if (falta26(error)) sin26 = true; return []; }
      return data || [];
    }
    function marcar(n) {
      pendientes = n; const g = $("#cfg"); if (!g) return;
      let c = g.querySelector(".cnt-sol"); if (!n) { if (c) c.remove(); g.setAttribute("aria-label", "Ajustes"); return; }
      if (!c) { c = document.createElement("span"); c.className = "cnt-sol"; g.append(c); }
      c.textContent = n > 9 ? "9+" : n; g.setAttribute("aria-label", `Ajustes. ${n} ${n === 1 ? "solicitud" : "solicitudes"} para unirse`);
    }
    function banner(r) {
      let h = document.getElementById("sol-aviso");
      if (!h) { h = document.createElement("div"); h.id = "sol-aviso"; h.setAttribute("role", "status"); h.setAttribute("aria-live", "polite"); document.body.append(h); }
      h.innerHTML = `<button class="fa-card" id="sa-ver">${window.Actividad ? Actividad.avatar(r.user_id, r.nombre, "lg", "users") : ""}<span class="fa-tx"><b>${esc(r.nombre || "Alguien")} quiere unirse a ${esc(hogar.nombre)}</b><span>Pidió entrar ${r.via === "qr" ? "con el QR" : "con el código"} de la casa</span><small>Toca para aprobar o rechazar</small></span></button><button class="fa-x" id="sa-x" aria-label="Cerrar aviso">${ico("close")}</button>`;
      h.className = "fam-aviso on";
      const cerrar = () => { h.className = "fam-aviso"; clearTimeout(h._t); };
      h.querySelector("#sa-ver").onclick = async () => { cerrar(); await abrirAjustes(); const w = $("#a-solwrap"); if (w) w.scrollIntoView({ block: "center" }); };
      h.querySelector("#sa-x").onclick = cerrar; clearTimeout(h._t); h._t = setTimeout(cerrar, 12000);
    }
    async function revisar() {
      const lista = await solicitudes(); marcar(lista.length);
      const vistas = S.get(AV(), []); const nueva = lista.find((r) => !vistas.includes(r.id));
      if (nueva) { S.set(AV(), [...vistas, ...lista.map((r) => r.id)].slice(-50)); banner(nueva); }
    }
    async function sigoEnCasa() {
      if (demo || !hogar || document.visibilityState === "hidden") return;
      let r; try { r = await sb.from("miembros").select("user_id").eq("hogar_id", hogar.id).eq("user_id", session.user.id); } catch (e) { return; }
      if (r.error || !Array.isArray(r.data) || r.data.length) return;
      // Me quitaron: se borra de este teléfono lo guardado de esa casa
      const casa = hogar.nombre, hid = hogar.id;
      Object.keys(localStorage).forEach((k) => { if (k === "cs-hogar" || k === "cs5-mirror" || k === "cs-pendientes-" + hid) try { localStorage.removeItem(k); } catch (e) {} });
      window.CS_SALIENDO = true; S.set("cs-quitado", { casa, hid }); location.reload();
    }
    function iniciar() {
      if (demo || !hogar) return;
      setInterval(sigoEnCasa, 60000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sigoEnCasa(); revisar(); } });
      window.addEventListener("cs-pendiente-rechazado", () => sigoEnCasa());
      if (!esAdmin() || sin26) return;
      revisar();
      try { canal = sb.channel("sol-casa-" + hogar.id).on("postgres_changes", { event: "*", schema: "public", table: "solicitudes", filter: "hogar_id=eq." + hogar.id }, () => revisar()).subscribe(); } catch (e) {}
    }
    return { iniciar, solicitudes, marcar, sigoEnCasa, get pendientes() { return pendientes; } };
  })();

  async function abrirAjustes() {
    const host = $("#ajustes"); host.innerHTML = ajustesHTML(); document.body.classList.add("noscroll");
    const cerrar = () => { host.innerHTML = ""; if (!document.querySelector(".sheet-wrap")) document.body.classList.remove("noscroll"); };
    $("#a-x").onclick = cerrar; $("#a-scrim").onclick = (e) => { if (e.target.id === "a-scrim") cerrar(); };
    const pintarVoces = () => { const s = $("#a-av"); if (s) s.innerHTML = opcionesVoz(Voz.cfg().voz); const a = $("#a-vaviso"); if (a) a.innerHTML = avisoVoces(); };
    Voz.alCargarVoces(pintarVoces);
    $("#a-an").onchange = (e) => { const n = e.target.value.trim(); if (n) { Voz.guardar({ nombre: n }); window.actualizarNombreAsistente && window.actualizarNombreAsistente(); toastP("Ahora tu asistente se llama " + n); } };
    const marcarPj = () => document.querySelectorAll("[data-apj]").forEach((b) => b.setAttribute("aria-checked", b.dataset.apj === Voz.personaje()));
    $("#a-av").onchange = (e) => { Voz.guardar({ voz: e.target.value }); marcarPj(); };
    document.querySelectorAll("[data-apj]").forEach((b) => { b.onclick = () => { Voz.guardar({ personaje: b.dataset.apj }); marcarPj(); pintarVoces(); }; });
    $("#a-id").onchange = (e) => Voz.guardar({ idioma: e.target.value });
    $("#a-try").onclick = () => Voz.hablar(`Hola, soy ${Voz.nombre()}. ¿En qué te ayudo?`, true);
    const tog = (id, key) => { $(id).onclick = () => { const v = !Voz.cfg()[key]; Voz.guardar({ [key]: v }); $(id).setAttribute("aria-pressed", v); }; };
    tog("#a-hablar", "hablar"); tog("#a-cont", "continuo");
    if (window.Memoria) Memoria.bindAjustes();
    if (window.Avisos) { const pintarAvisos = () => { const h = $("#av-host"); if (h) { h.innerHTML = Avisos.ajustesHTML(); Avisos.bindAjustes(pintarAvisos); } }; Avisos.leerEstado().then(pintarAvisos); }
    document.querySelectorAll("[data-amod]").forEach((l) => { const elegir = () => { Voz.guardar({ modo: l.dataset.amod }); document.querySelectorAll("[data-amod]").forEach((x) => { const on = x === l; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); }); }; l.onclick = elegir; l.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(); } }; });
    if ($("#a-retry")) $("#a-retry").onclick = () => { S.del("cs-config"); location.reload(); };
    $("#a-imp").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const datos = JSON.parse(await f.text());
        if (!datos.productos) throw new Error("formato");
        let n;
        if (demo) { const arr = (o) => Object.entries(o || {}).map(([id, d]) => ({ ...d, id })); S.set("cs5-productos", arr(datos.productos)); S.set("cs5-lista", arr(datos.lista)); if (datos.compras) S.set("cs5-compras", arr(datos.compras)); n = Object.keys(datos.productos).length; toastP(`Se importaron ${n} productos`); setTimeout(() => location.reload(), 800); return; }
        n = await caps.db.importar(datos); toastP(`Listo: se importaron ${n} registros`);
      } catch (err) { toastP("Ese archivo no es una copia de Casita Stock."); }
    };
    $("#a-exp").onclick = async () => {
      try {
        const datos = demo ? { version: 1, productos: Object.fromEntries((S.get("cs5-productos", []) || []).map((p) => [p.id, p])), lista: Object.fromEntries((S.get("cs5-lista", []) || []).map((p) => [p.id, p])), compras: Object.fromEntries((S.get("cs5-compras", []) || []).map((p) => [p.id, p])) } : await caps.db.exportar();
        await downloads.save({ filename: `casita-stock-copia-${new Date().toISOString().slice(0, 10)}.json`, data: JSON.stringify(datos) });
      } catch (err) { if (!err || err.code !== "declined") toastP("No se pudo guardar la copia."); }
    };
    if (!demo) {
      let fam = await cargarMiembros();
      const pintarFam = () => { const ul = $("#a-fam"); if (ul) ul.innerHTML = filaMiembros(fam); ul && ul.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = () => hojaQuitar(fam.find((m) => m.user_id === b.dataset.quitar), recargarFamilia))); };
      const recargarFamilia = async () => { miembros = []; fam = await cargarMiembros(true); pintarFam(); await pintarSolicitudes(); await pintarBloqueos(); };
      const pintarSolicitudes = async () => {
        const w = $("#a-solwrap"); if (!w) return;
        const lista = await Familia.solicitudes(); Familia.marcar(lista.length);
        w.hidden = !lista.length; $("#a-soln").textContent = lista.length || "";
        $("#a-sol").innerHTML = lista.map((r) => `<div class="sol" data-sol="${esc(r.id)}"><div class="sol-q">${window.Actividad ? Actividad.avatar(r.user_id, r.nombre, "md") : ""}<div class="sol-tx"><b>${esc(r.nombre || "Sin nombre")}</b><small>${esc([r.correo, hace(r.creado), r.via === "qr" ? "con QR" : "con código"].filter(Boolean).join(" · "))}</small></div></div>
          <div class="sol-acc"><button class="btn primary sm" data-aprobar="${esc(r.id)}">${ico("check")}Aprobar</button><button class="btn sm" data-rechazar="${esc(r.id)}">${ico("close")}Rechazar</button></div></div>`).join("");
        const responder = async (id, si, b) => {
          b.disabled = true; const r = lista.find((x) => x.id === id);
          const { error } = await sb.rpc("responder_solicitud", { sol: id, aprobar: si });
          if (error) { b.disabled = false; return toastP(msgError(error)); }
          toastP(si ? `${(r && r.nombre) || "La persona"} ya es parte de la casa` : "Solicitud rechazada"); recargarFamilia();
        };
        $("#a-sol").querySelectorAll("[data-aprobar]").forEach((b) => (b.onclick = () => responder(b.dataset.aprobar, true, b)));
        $("#a-sol").querySelectorAll("[data-rechazar]").forEach((b) => (b.onclick = () => responder(b.dataset.rechazar, false, b)));
      };
      const pintarBloqueos = async () => {
        const w = $("#a-bloqwrap"); if (!w) return;
        const { data } = await sb.from("bloqueos").select("user_id,nombre,creado").eq("hogar_id", hogar.id).order("creado", { ascending: false });
        const lista = data || []; w.hidden = !lista.length;
        $("#a-bloq").innerHTML = lista.map((b) => `<li class="mi-fila">${window.Actividad ? Actividad.avatar(b.user_id, b.nombre, "md") : ""}<div><b>${esc(b.nombre || "Sin nombre")}</b><span>No puede pedir unirse a esta casa</span></div><button class="btn sm" data-desb="${esc(b.user_id)}">Desbloquear</button></li>`).join("");
        $("#a-bloq").querySelectorAll("[data-desb]").forEach((x) => (x.onclick = async () => {
          x.disabled = true; const { error } = await sb.rpc("desbloquear", { h: hogar.id, quien: x.dataset.desb });
          if (error) { x.disabled = false; return toastP(msgError(error)); }
          toastP("Desbloqueado: ya puede volver a pedir unirse"); pintarBloqueos();
        }));
      };
      pintarFam(); pintarBloqueos().catch(() => {}); await pintarSolicitudes().catch(() => {});
      if ($("#a-qr")) $("#a-qr").onclick = hojaQR;
      const pintarFoto = () => { const me2 = fam.find((m) => m.user_id === session.user.id); const a = $("#a-fav"); if (a && window.Actividad) a.innerHTML = Actividad.avatar(session.user.id, hogar.miNombre, "xl"); const d = $("#a-fdel"); if (d) d.hidden = !(me2 && me2.foto); };
      pintarFoto();
      const subirFoto = async (e) => {
        const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
        try {
          const foto = await fotoCuadrada(f);
          await caps.user.guardarFoto(foto); pintarFoto(); toastP("Foto guardada");
          pintarFam();
        } catch (err) { toastP(err && err.code === "sin_columna" ? "Falta un paso en Supabase: pega supabase/familia-2-6.sql." : "No se pudo guardar la foto. Intenta otra vez."); }
      };
      ["#a-fcam", "#a-fgal"].forEach((q) => { const i = $(q); if (i) i.onchange = subirFoto; });
      if ($("#a-fdel")) $("#a-fdel").onclick = async () => { try { await caps.user.guardarFoto(null); pintarFoto(); toastP("Foto quitada"); } catch (e) { toastP("No se pudo quitar la foto."); } };
      $("#a-share").onclick = async () => {
        const t = !sin26 && hogar.invitacion
          ? `Te invito a nuestra casa en Casita Stock. Abre este enlace, entra con tu correo y toca “Solicitar unirme”: ${enlaceInvitacion(hogar.invitacion)} (o escribe el código ${hogar.codigo}).`
          : `Únete a nuestra casa en Casita Stock: abre ${origen}, entra con tu correo, elige “Unirme con el código” y escribe ${hogar.codigo}`;
        try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toastP("Invitación copiada"); } } catch (e) {}
      };
      if ($("#a-newcode")) $("#a-newcode").onclick = async () => {
        const b = $("#a-newcode"); if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = sin26 ? "¿Seguro? El código anterior dejará de servir" : "¿Seguro? El código y el QR anteriores dejarán de servir"; return; }
        const { data, error } = await sb.rpc("nuevo_codigo", { h: hogar.id });
        if (error) return toastP(msgError(error, "No se pudo cambiar el código."));
        hogar.codigo = data; await cargarHogar(); S.set("cs-hogar", hogar); toastP("Código nuevo listo"); abrirAjustes();
      };
      $("#a-casa").onchange = async (e) => { const n = e.target.value.trim(); if (!n) return; const { error } = await sb.from("hogares").update({ nombre: n }).eq("id", hogar.id); if (!error) { hogar.nombre = n; S.set("cs-hogar", hogar); toastP("Nombre guardado"); } };
      $("#a-yo").onchange = async (e) => { const n = e.target.value.trim(); if (!n) return; const { error } = await sb.from("miembros").update({ nombre: n }).eq("hogar_id", hogar.id).eq("user_id", session.user.id); if (!error) { hogar.miNombre = n; S.set("cs-hogar", hogar); miembros = []; toastP("Nombre guardado"); } };
      $("#a-out").onclick = async () => {
        const b = $("#a-out"); if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "Toca otra vez para cerrar sesión"; return; }
        await sb.auth.signOut(); ["cs-hogar", "cs5-mirror"].forEach(S.del); location.reload();
      };
    }
  }
  const toastP = (t) => (typeof toast === "function" ? toast(t) : null);

  /* ---------------- Arranque ---------------- */
  async function iniciar() {
    // Diagnóstico: si queda en modo demo, se guarda el motivo para mostrarlo en Ajustes y en la consola de Xcode
    const dir = (BASE || location.origin) + "/api/config";
    if (nativo && !BASE) motivoDemo = "La app no tiene la dirección de tu servidor. Escríbela en web/js/config-nativo.js y vuelve a compilar.";
    else {
      try {
        const r = await fetch(BASE + "/api/config", { cache: "no-store" });
        if (r.ok) {
          let j = null; try { j = await r.json(); } catch (e) {}
          if (j && typeof j === "object") { cfg = j; S.set("cs-config", cfg); }
          else motivoDemo = `${dir} no devolvió la configuración. En Vercel, revisa que Root Directory sea "web" y publica otra vez.`;
        } else motivoDemo = r.status === 404
          ? `El servidor respondió 404 en ${dir}: Vercel no tiene la app. Revisa que Root Directory sea "web" y que el proyecto use el repositorio nuevo.`
          : `El servidor respondió ${r.status} en ${dir}. Revisa la publicación en Vercel.`;
      } catch (e) { motivoDemo = `No se pudo conectar con ${dir}. Revisa internet y que la dirección sea correcta. Si en Safari sí abre, Vercel tiene una versión vieja (anterior a la 1.2) que no deja entrar a la app de Xcode.`; }
    }
    if (!cfg) { cfg = S.get("cs-config", null); }
    if (cfg && (!cfg.supabaseUrl || !cfg.supabaseAnonKey)) motivoDemo = "Tu servidor no tiene SUPABASE_URL o SUPABASE_ANON_KEY. En Vercel: Settings → Environment Variables, agrégalas y luego Deployments → Redeploy.";
    else if (cfg && !window.supabase) motivoDemo = "No se cargó la librería de Supabase. Vuelve a abrir la app.";
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      demo = true; window.CS_DEMO = true;
      console.error("[Casita Stock] Modo demo: " + (motivoDemo || "sin configuración"));
      if (!Voz.cfg().nombre) await pasoAsistente();
      cerrarGate(); listo(); return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "cs-auth" } });
    const { data } = await sb.auth.getSession(); session = data.session;
    if (!session) await pasoLogin();
    await cargarHogar();
    if (!hogar) await pasoHogar();
    if (!Voz.cfg().nombre) await pasoAsistente();
    sb.auth.onAuthStateChange((ev, s) => { if (s) session = s; if (ev === "SIGNED_OUT") location.reload(); });
    caps = { db: hacerDb(), user: hacerUser(), sample: cfg.ia ? hacerSample() : null, downloads, memoria: hacerMemoria() };
    cerrarGate(); listo();
    cargarMiembros().catch(() => {});
    Familia.iniciar();
    const bienvenida = S.get("cs-bienvenida", ""); if (bienvenida) { S.del("cs-bienvenida"); setTimeout(() => toastP(`¡Te aprobaron! Ya eres parte de ${bienvenida}`), 900); }
    const inv = S.get("cs-invitacion", "");
    if (inv) {   // Abrió una invitación pero ya tiene casa
      S.del("cs-invitacion");
      sb.rpc("ver_invitacion", { clave: inv }).then(({ data }) => { if (data && data.estado !== "miembro") setTimeout(() => toastP(`Abriste una invitación a ${data.casa}, pero ya eres parte de ${hogar.nombre}.`), 1200); }).catch(() => {});
    }
  }

  window.Plataforma = { abrirAjustes, nativo, get demo() { return demo; }, get instalada() { return instalada; }, get esIOS() { return esIOS; }, ready };
  document.addEventListener("DOMContentLoaded", () => {
    $("#gate").hidden = false;
    iniciar().catch((e) => { console.error(e); gate(`<section class="card"><h2 class="gate-h">No se pudo abrir</h2><p class="lead">Revisa tu conexión a internet y vuelve a intentarlo.</p><button class="btn primary" onclick="location.reload()">Intentar otra vez</button></section>`); });
  });
})();
