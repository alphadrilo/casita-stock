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

  let cfg = null, sb = null, session = null, hogar = null, miembros = [], caps = null, demo = false;
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
    const { data, error } = await sb.from("miembros").select("hogar_id,nombre,rol,hogares(id,nombre,codigo)").eq("user_id", session.user.id);
    if (error) { const c = S.get("cs-hogar", null); if (c && c.uid === session.user.id) hogar = c; return; }
    const elegido = S.get("cs-hogar", null);
    const filas = (data || []).filter((m) => m.hogares);
    const m = filas.find((x) => elegido && x.hogar_id === elegido.id) || filas[0];
    hogar = m ? { id: m.hogar_id, nombre: m.hogares.nombre, codigo: m.hogares.codigo, miNombre: m.nombre, rol: m.rol, uid: session.user.id, otros: filas.length } : null;
    if (hogar) S.set("cs-hogar", hogar);
  }
  async function cargarMiembros() {
    if (!sb || !hogar) return miembros;
    const { data } = await sb.from("miembros").select("user_id,nombre,rol").eq("hogar_id", hogar.id);
    if (data) miembros = data;
    return miembros;
  }

  function pasoHogar() {
    return new Promise((fin) => {
      const elegir = (msg) => {
        gate(`<section class="card"><h2 class="gate-h">Tu casa</h2>
          <p class="lead">Todos los que se unan a la misma casa ven el mismo inventario y la misma lista de compras.</p>
          <div class="field"><label for="g-yo">¿Cómo te llamas?</label><input type="text" id="g-yo" autocomplete="given-name" placeholder="Ej.: Levi" value="${esc(S.get("cs-minombre", ""))}"></div>
          ${msg ? `<div class="notice bad">${ico("alert")}<span>${esc(msg)}</span></div>` : ""}
          <button class="btn primary" id="g-new">${ico("plus")}Crear mi casa</button>
          <div class="divider">o si alguien de tu familia ya la creó</div>
          <div class="field"><label for="g-cod">Código de la casa</label><input type="text" id="g-cod" class="code" autocapitalize="characters" maxlength="12" placeholder="Ej.: 4F7A2C"></div>
          <button class="btn" id="g-join">${ico("users")}Unirme con el código</button></section>`);
        const yo = () => { const n = $("#g-yo").value.trim(); S.set("cs-minombre", n); return n; };
        $("#g-new").onclick = async () => {
          const n = yo(); if (!n) return elegir("Escribe tu nombre para que tu familia sepa quién compró o usó cada cosa.");
          $("#g-new").disabled = true;
          const { error } = await sb.rpc("crear_hogar", { nombre_hogar: `Casa de ${n}`, mi_nombre: n });
          if (error) return elegir("No se pudo crear la casa. Revisa tu conexión e inténtalo otra vez.");
          await cargarHogar(); fin();
        };
        $("#g-join").onclick = async () => {
          const n = yo(); const c = $("#g-cod").value.trim();
          if (!n) return elegir("Escribe tu nombre primero.");
          if (c.length < 4) return elegir("Escribe el código que te compartieron.");
          $("#g-join").disabled = true;
          const { error } = await sb.rpc("unirse_hogar", { codigo_invitacion: c, mi_nombre: n });
          if (error) return elegir(/no existe/i.test(error.message) ? "Ese código no existe. Revisa las letras y números." : "No se pudo unir. Revisa tu conexión.");
          await cargarHogar(); fin();
        };
      };
      elegir();
    });
  }

  const SUGERIDOS = ["Casi", "Lupe", "Tina", "Nico", "Rosa", "Max"];
  function opcionesVoz(sel) {
    const vs = Voz.voces();
    if (!vs.length) return `<option value="">Voz del teléfono</option>`;
    return vs.map((v) => `<option value="${esc(v.name)}" ${v.name === sel ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("");
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
    let canal = null, cargadas = {};
    const snapDoc = (id, d) => ({ id, exists: d !== undefined, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } });
    const avisar = (col) => {
      const m = cache[col] || new Map();
      const docs = [...m.entries()].map(([id, d]) => snapDoc(id, d));
      (oyentes[col] || []).forEach((fn) => { try { fn({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }); } catch (e) { console.error(e); } });
      Object.entries(docOyentes).forEach(([k, fns]) => { const [c, id] = k.split("/"); if (c === col) fns.forEach((fn) => { try { fn(snapDoc(id, m.get(id))); } catch (e) { console.error(e); } }); });
    };
    const errDb = (e) => ({ code: e && e.code === "42501" ? "invalid_argument" : /fetch|network|Failed/i.test(String(e && e.message)) ? "unavailable" : "invalid_argument", message: String((e && e.message) || e) });
    async function cargar(col) {
      const { data, error } = await sb.from("documentos").select("id,data").eq("hogar_id", hid).eq("coleccion", col);
      if (error) throw error;
      cache[col] = new Map((data || []).map((r) => [r.id, r.data]));
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
        .subscribe((st) => { if (st === "SUBSCRIBED") Object.keys(cargadas).forEach((c) => cargarConReintento(c)); });
    }
    const refrescar = () => Object.keys(cargadas).forEach((c) => cargarConReintento(c));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refrescar(); });
    window.addEventListener("online", refrescar);

    const docRef = (col, id) => ({
      id, path: col + "/" + id,
      async get() {
        const { data, error } = await sb.from("documentos").select("data").eq("hogar_id", hid).eq("coleccion", col).eq("id", id).maybeSingle();
        if (error) throw errDb(error);
        return snapDoc(id, data ? data.data : undefined);
      },
      async set(body) {
        const prev = cache[col] && cache[col].get(id);
        (cache[col] || (cache[col] = new Map())).set(id, body); avisar(col);
        const { error } = await sb.from("documentos").upsert({ hogar_id: hid, coleccion: col, id, data: body, actualizado: new Date().toISOString() });
        if (error) { if (prev === undefined) cache[col].delete(id); else cache[col].set(id, prev); avisar(col); throw errDb(error); }
      },
      async update(body) { const s = await this.get(); if (!s.exists) throw { code: "invalid_argument", message: "No existe" }; return this.set({ ...s.data(), ...body }); },
      async delete() {
        const prev = cache[col] && cache[col].get(id);
        if (cache[col]) { cache[col].delete(id); avisar(col); }
        const { error } = await sb.from("documentos").delete().eq("hogar_id", hid).eq("coleccion", col).eq("id", id);
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

  /* ---------------- Personas ---------------- */
  function hacerUser() {
    return {
      isOwner: () => hogar && hogar.rol === "dueño", canEdit: () => true, can: async () => true,
      id: async () => session.user.id,
      me: async () => ({ id: session.user.id, name: hogar.miNombre || "" }),
      name: async () => hogar.miNombre || "",
      async profiles(ids) {
        if (!miembros.length) await cargarMiembros();
        const out = {}; [].concat(ids).forEach((id) => { const m = miembros.find((x) => x.user_id === id); out[id] = { id, name: m ? m.nombre : "" }; });
        return out;
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
      const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
      const ia = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0); const a = ia.length ? Math.min(...ia) : -1;
      const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
      if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
      throw { code: "invalid_json", message: "Respuesta no válida", text: t };
    }
    sample.json = async (input, opts = {}) => {
      const extra = "\n\nResponde únicamente con el JSON pedido, sin texto antes ni después.";
      const inp = typeof input === "string" ? input + extra : input.map((m, i) => i === input.length - 1 ? { ...m, content: m.content + extra } : m);
      const r = await sample(inp, { ...opts, json: true });
      if (r.truncated) throw { code: "invalid_json", message: "Respuesta incompleta", text: r.text };
      return parse(r.text);
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
        <div class="field"><span class="lbl">Código para invitar a tu familia</span><div class="big-num" style="font-family:var(--mono);letter-spacing:.12em">${esc(hogar.codigo)}</div>
          <p class="hint" style="margin:0">Quien instale la app entra con su correo, elige “Unirme con el código” y escribe este código.</p>
          <div class="row"><button class="btn sm" id="a-share">${ico("send")}Compartir código</button><button class="btn sm" id="a-newcode">Cambiar código</button></div></div>
        <div class="field"><span class="lbl">Quiénes están</span><ul class="list" id="a-fam"><li><span class="hint">Cargando…</span></li></ul></div>
        <div class="field"><label for="a-yo">Tu nombre</label><input type="text" id="a-yo" value="${esc(hogar.miNombre || "")}"></div></section>`;
    return `<div class="sheet-wrap" id="a-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="a-t">
      <div class="grab" aria-hidden="true"></div>
      <div class="top"><h2 id="a-t">Ajustes</h2><button class="x" id="a-x" aria-label="Cerrar">${ico("close")}</button></div>
      <section class="card ai"><span class="aitag">${ico("mic")}Tu asistente</span>
        <div class="field"><label for="a-an">Nombre</label><input type="text" id="a-an" maxlength="20" value="${esc(c.nombre)}"></div>
        <div class="field"><label for="a-av">Voz</label><select id="a-av">${opcionesVoz(c.voz)}</select><button class="linkbtn ai" id="a-try">Escuchar cómo suena</button></div>
        <div class="field"><label for="a-id">Idioma para escucharte</label><select id="a-id">${[["es-US", "Español (Estados Unidos)"], ["es-MX", "Español (México)"], ["es-CO", "Español (Colombia)"], ["es-ES", "Español (España)"]].map(([v, l]) => `<option value="${v}" ${v === c.idioma ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><span class="lbl">¿Cómo te atiende ${esc(c.nombre || "tu asistente")}?</span>
          <div class="ml-opc" role="radiogroup">
            <label class="${c.modo !== "texto" ? "on" : ""}" data-amod="voz" role="radio" aria-checked="${c.modo !== "texto"}" tabindex="0"><span class="r"></span><span><b>Solo voz (manos libres)</b><span class="h">Habla y te responde en voz alta. En pantalla ves solo lo que entendió y lo que va a guardar.</span></span></label>
            <label class="${c.modo === "texto" ? "on" : ""}" data-amod="texto" role="radio" aria-checked="${c.modo === "texto"}" tabindex="0"><span class="r"></span><span><b>Voz y texto</b><span class="h">Además muestra toda la conversación escrita, como un chat.</span></span></label>
          </div><p class="hint" style="margin:0">En los dos modos, nada se guarda sin tu “sí”.</p></div>
        <button class="check" id="a-hablar" aria-pressed="${c.hablar}"><span class="box">${ico("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Contestar en voz alta</span><br><span class="cm">En “Voz y texto”, lee sus respuestas con la voz elegida. En “Solo voz” siempre habla.</span></span><span></span></button>
        <button class="check" id="a-cont" aria-pressed="${c.continuo}"><span class="box">${ico("check")}</span><span><span class="cn" style="text-decoration:none;color:var(--ink)">Conversación continua</span><br><span class="cm">Después de responder, vuelve a escucharte. Di “gracias” para terminar.</span></span><span></span></button>
      </section>
      ${fam}
      <section class="card"><span class="aitag g">${ico("box")}Tus datos</span>
        <label class="btn sm" style="position:relative">${ico("plus")}Importar una copia (.json)<input type="file" id="a-imp" accept=".json,application/json" style="position:absolute;inset:0;opacity:0"></label>
        <button class="btn sm" id="a-exp">${ico("down")}Guardar una copia</button>
        <p class="hint" style="margin:0">Usa “Importar” para traer tus productos de la versión anterior con el archivo importar.json.</p></section>
      ${!instalada ? `<section class="card"><span class="aitag g">${ico("plus")}Instalar en el teléfono</span><p class="lead" style="margin:0">En iPhone: abre esta página en Safari, toca Compartir y luego “Añadir a pantalla de inicio”.</p></section>` : ""}
      <section class="card"><span class="aitag g">${ico("mic")}Llamarlo con Siri</span><p class="lead" style="margin:0">${nativo ? `En la app Atajos crea un atajo con la acción <b>Abrir app → Casita Stock</b> y ponle de nombre <b>${esc(c.nombre || "tu asistente")}</b>. Así dices “Oye Siri, ${esc(c.nombre || "tu asistente")}”, se abre la app y tocas el micrófono.` : `En la app Atajos crea un atajo que abra <b>${esc(origen)}/?hablar=1</b> y ponle de nombre <b>${esc(c.nombre || "tu asistente")}</b>. Así puedes decir “Oye Siri, ${esc(c.nombre || "tu asistente")}” y se abre listo para escucharte.`}</p></section>
      ${!demo ? `<section class="card"><span class="hint">Entraste como ${esc(session.user.email || "")}</span><button class="btn sm danger" id="a-out">Cerrar sesión</button></section>` : ""}
      <p class="hint" style="text-align:center;margin:0">Casita Stock 1.5${nativo ? " · app de iPhone" : ""}</p>
    </div></div>`;
  }
  async function abrirAjustes() {
    const host = $("#ajustes"); host.innerHTML = ajustesHTML(); document.body.classList.add("noscroll");
    const cerrar = () => { host.innerHTML = ""; if (!document.querySelector(".sheet-wrap")) document.body.classList.remove("noscroll"); };
    $("#a-x").onclick = cerrar; $("#a-scrim").onclick = (e) => { if (e.target.id === "a-scrim") cerrar(); };
    Voz.alCargarVoces(() => { const s = $("#a-av"); if (s) s.innerHTML = opcionesVoz(Voz.cfg().voz); });
    $("#a-an").onchange = (e) => { const n = e.target.value.trim(); if (n) { Voz.guardar({ nombre: n }); window.actualizarNombreAsistente && window.actualizarNombreAsistente(); toastP("Ahora tu asistente se llama " + n); } };
    $("#a-av").onchange = (e) => Voz.guardar({ voz: e.target.value });
    $("#a-id").onchange = (e) => Voz.guardar({ idioma: e.target.value });
    $("#a-try").onclick = () => Voz.hablar(`Hola, soy ${Voz.nombre()}. ¿En qué te ayudo?`, true);
    const tog = (id, key) => { $(id).onclick = () => { const v = !Voz.cfg()[key]; Voz.guardar({ [key]: v }); $(id).setAttribute("aria-pressed", v); }; };
    tog("#a-hablar", "hablar"); tog("#a-cont", "continuo");
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
      const fam = await cargarMiembros();
      const ul = $("#a-fam"); if (ul) ul.innerHTML = fam.map((m) => `<li><span class="ico g">${ico("users")}</span><div><b>${esc(m.nombre || "Sin nombre")}${m.user_id === session.user.id ? " (tú)" : ""}</b><span>${m.rol === "dueño" ? "Creó la casa" : "Miembro"}</span></div></li>`).join("");
      $("#a-share").onclick = async () => {
        const t = `Únete a nuestra casa en Casita Stock: abre ${origen}, entra con tu correo, elige “Unirme con el código” y escribe ${hogar.codigo}`;
        try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toastP("Invitación copiada"); } } catch (e) {}
      };
      $("#a-newcode").onclick = async () => {
        const b = $("#a-newcode"); if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "¿Seguro? El código anterior dejará de servir"; return; }
        const { data, error } = await sb.rpc("nuevo_codigo", { h: hogar.id });
        if (error) return toastP("No se pudo cambiar el código.");
        hogar.codigo = data; S.set("cs-hogar", hogar); abrirAjustes();
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
    caps = { db: hacerDb(), user: hacerUser(), sample: cfg.ia ? hacerSample() : null, downloads };
    cerrarGate(); listo();
    cargarMiembros().catch(() => {});
  }

  window.Plataforma = { abrirAjustes, nativo, get demo() { return demo; }, get instalada() { return instalada; }, get esIOS() { return esIOS; }, ready };
  document.addEventListener("DOMContentLoaded", () => {
    $("#gate").hidden = false;
    iniciar().catch((e) => { console.error(e); gate(`<section class="card"><h2 class="gate-h">No se pudo abrir</h2><p class="lead">Revisa tu conexión a internet y vuelve a intentarlo.</p><button class="btn primary" onclick="location.reload()">Intentar otra vez</button></section>`); });
  });
})();
