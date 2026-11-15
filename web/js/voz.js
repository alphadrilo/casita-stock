/* Casita Stock — voz: escuchar (reconocimiento del teléfono) y hablar (voz del teléfono).
   La configuración del asistente (nombre, voz, idioma) se guarda en cada teléfono. */
window.Voz = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // En la app nativa (Xcode) se usa el reconocimiento de voz del iPhone a través del plugin de Capacitor
  const NAT = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition;
  let pararNativo = null;
  const KEY = "cs-asistente";
  const DEF = { nombre: "", voz: "", idioma: "es-US", hablar: true, continuo: true, modo: "voz", personaje: "" }; // personaje: "mujer" | "hombre" ("" = según la voz) // modo: "voz" (manos libres) | "texto" (chat completo)
  let rec = null, escuchando = false, hablando = false, turnoHabla = 0;

  function cfg() { try { return { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; } catch (e) { return { ...DEF }; } }
  function guardar(cambios) {
    const antes = personaje();
    let c = { ...cfg(), ...cambios };
    // Elegir una voz cambia el personaje si se sabe si es de mujer o de hombre
    if (cambios.voz !== undefined && !cambios.personaje) { const g = generoVoz(cambios.voz); if (g) c.personaje = g; }
    // Elegir el personaje busca una voz de ese tipo, si la voz actual no lo es
    if (cambios.personaje && generoVoz(c.voz) !== cambios.personaje) { const v = voces().find((x) => generoVoz(x.name) === cambios.personaje); if (v) c.voz = v.name; }
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    if (personaje() !== antes) avisar("cs-personaje", personaje());
    return c;
  }
  const avisar = (nombre, detail) => { try { window.dispatchEvent(new CustomEvent(nombre, { detail })); } catch (e) {} };

  /* Voces en español de iPhone, Mac, Android y Windows. El sistema no dice si una voz es de mujer o de hombre,
     así que se reconoce por su nombre. "" = no se sabe. */
  const MUJER = /\b(paulina|m[oó]nica|marisol|ang[eé]lica|isabela|francisca|soledad|helena|laura|luc[ií]a|sabina|esperanza|elvira|dalia|paloma|camila|elena|ximena|valentina|catalina|carmen|flo|sandy|shelley|grandma|abuela|female|mujer)\b/i;
  const HOMBRE = /\b(jorge|juan|diego|carlos|eddy|reed|rocko|grandpa|abuelo|[aá]lvaro|pablo|enrique|jaime|ra[uú]l|alonso|gonzalo|tom[aá]s|jorge|male|hombre)\b/i;
  function generoVoz(nombre) { const n = String(nombre || ""); return MUJER.test(n) ? "mujer" : HOMBRE.test(n) ? "hombre" : ""; }
  function personaje() { const c = cfg(); return c.personaje === "hombre" || c.personaje === "mujer" ? c.personaje : generoVoz(c.voz) || "mujer"; }
  const IMG = { mujer: "img/lilu-mujer.gif", hombre: "img/lilu-hombre.gif" };

  const ttsSoportado = "speechSynthesis" in window;
  function voces() {
    if (!ttsSoportado) return [];
    return speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang))
      .sort((a, b) => (b.localService - a.localService) || a.name.localeCompare(b.name));
  }
  function alCargarVoces(fn) {
    if (!ttsSoportado) return;
    if (voces().length) fn();
    speechSynthesis.addEventListener?.("voiceschanged", fn);
  }
  function vozElegida() {
    const c = cfg(), vs = voces();
    return vs.find((v) => v.name === c.voz) || vs.find((v) => v.lang === c.idioma) || vs.find((v) => v.lang.startsWith(c.idioma.slice(0, 2))) || vs[0] || null;
  }
  const limpiar = (t) => String(t || "").replace(/[*_#`>\[\](){}]/g, "").replace(/\$(\d)/g, "$1 dólares ").replace(/\s+/g, " ").trim();

  function hablar(texto, forzar) {
    return new Promise((ok) => {
      if (!ttsSoportado || (!forzar && !cfg().hablar) || !texto) return ok();
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(limpiar(texto));
        const v = vozElegida();
        u.lang = v ? v.lang : cfg().idioma;
        if (v) u.voice = v;
        u.rate = 1.03;
        // Avisa cuando empieza y termina de hablar (para animar al personaje)
        let listo = false; const turno = ++turnoHabla;
        const fin = () => { if (listo) return; listo = true; if (hablando && turno === turnoHabla) { hablando = false; avisar("cs-habla", false); } ok(); };
        u.onstart = () => { if (!listo && !hablando) { hablando = true; avisar("cs-habla", true); } };
        u.onend = u.onerror = fin;
        speechSynthesis.speak(u);
        if (!hablando) { hablando = true; avisar("cs-habla", true); }
        // Respaldo: algunos teléfonos no avisan cuando terminan
        setTimeout(fin, Math.min(30000, 1500 + limpiar(texto).length * 90));
      } catch (e) { ok(); }
    });
  }
  function callar() { turnoHabla++; try { ttsSoportado && speechSynthesis.cancel(); } catch (e) {} if (hablando) { hablando = false; avisar("cs-habla", false); } }

  async function escucharNativo({ onParcial } = {}) {
    const P = NAT;
    const av = await P.available().catch(() => ({ available: false }));
    if (!av.available) throw { code: "no_soportado" };
    let perm = await P.checkPermissions().catch(() => ({ speechRecognition: "prompt" }));
    if (perm.speechRecognition !== "granted") perm = await P.requestPermissions().catch(() => ({ speechRecognition: "denied" }));
    if (perm.speechRecognition !== "granted") throw { code: "not-allowed" };
    callar();
    return new Promise(async (resolve, reject) => {
      let texto = "", hecho = false, silencio = null, maximo = null;
      const handles = [];
      const fin = async (err) => {
        if (hecho) return; hecho = true; escuchando = false; pararNativo = null;
        clearTimeout(silencio); clearTimeout(maximo);
        try { await P.stop(); } catch (e) {}
        handles.forEach((h) => { try { h.remove(); } catch (e) {} });
        err ? reject(err) : resolve(texto.trim());
      };
      // Termina solo cuando dejas de hablar (1,5 s de silencio) o a los 20 s
      const rearmar = () => { clearTimeout(silencio); silencio = setTimeout(() => fin(), texto ? 1500 : 7000); };
      maximo = setTimeout(() => fin(), 20000);
      pararNativo = () => fin();
      try {
        handles.push(await P.addListener("partialResults", (d) => { const t = (d && d.matches && d.matches[0]) || ""; if (t) { texto = t; onParcial && onParcial(t); } rearmar(); }));
        handles.push(await P.addListener("listeningState", (d) => { if (d && d.status === "stopped" && texto) fin(); }));
        escuchando = true; rearmar();
        await P.start({ language: cfg().idioma || "es-US", maxResults: 1, partialResults: true, popup: false });
      } catch (e) { fin({ code: /denied|permission/i.test(String(e && (e.message || e))) ? "not-allowed" : "error" }); }
    });
  }

  function escuchar({ onParcial } = {}) {
    if (NAT) return escucharNativo({ onParcial });
    return new Promise((resolve, reject) => {
      if (!SR) return reject({ code: "no_soportado" });
      callar();
      try { rec && rec.abort(); } catch (e) {}
      rec = new SR();
      rec.lang = cfg().idioma || "es-US";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let final = "", parcial = "", hecho = false;
      const fin = (fn) => { if (hecho) return; hecho = true; escuchando = false; fn(); };
      rec.onresult = (e) => {
        parcial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t; else parcial += t;
        }
        onParcial && onParcial((final + " " + parcial).trim());
      };
      rec.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") fin(() => resolve((final + " " + parcial).trim()));
        else fin(() => reject({ code: e.error || "error" }));
      };
      rec.onend = () => fin(() => resolve((final + " " + parcial).trim()));
      try { rec.start(); escuchando = true; } catch (err) { fin(() => reject({ code: "start" })); }
    });
  }
  function parar() { if (pararNativo) return pararNativo(); try { rec && rec.stop(); } catch (e) {} }

  function mensajeError(e) {
    const c = e && e.code;
    if (c === "not-allowed" && NAT) return "Falta permiso. Ve a Ajustes del iPhone > Casita Stock y activa Micrófono y Reconocimiento de voz.";
    if (c === "not-allowed") return "El micrófono está bloqueado. Permite el micrófono para Casita Stock en los ajustes del iPhone (Safari > Micrófono) y vuelve a intentarlo.";
    if (c === "service-not-allowed") return "El reconocimiento de voz está apagado. Activa Siri y Dictado en los ajustes del iPhone, o usa el micrófono del teclado.";
    if (c === "no_soportado") return "Este navegador no puede escuchar directamente. Usa el micrófono del teclado.";
    if (c === "network") return "Sin conexión no puedo escucharte. Revisa tu internet o escribe tu mensaje.";
    if (c === "audio-capture") return "No encuentro el micrófono. Revisa que nada más lo esté usando.";
    return "No pude escucharte. Toca el micrófono y vuelve a intentarlo, o escribe tu mensaje.";
  }

  return {
    soportado: !!SR || !!NAT, nativo: !!NAT, ttsSoportado, cfg, guardar, voces, alCargarVoces, hablar, callar, escuchar, parar, mensajeError,
    get escuchando() { return escuchando; },
    get hablando() { return hablando; },
    personaje, generoVoz, imagen: (g) => IMG[g || personaje()],
    nombre() { return cfg().nombre || "tu asistente"; },
  };
})();
