# Casita Stock: probar en iPhone y correr en Xcode

Esta guía explica cómo probar Casita Stock en el simulador de iPhone, en tu iPhone real y como app nativa compilada en Xcode. También lista todo lo que tienes que instalar en la Mac.

## Tres formas de probar

| | Qué es | Necesitas cuentas | Tiempo | Para qué sirve |
|---|---|---|---|---|
| **A. Simulador con Safari** | La app web en un iPhone virtual de la Mac, en modo demo | No | 10 min | Ver pantallas y flujos rápido |
| **B. App web en tu iPhone** | La app publicada en Vercel y agregada a la pantalla de inicio | Sí (Supabase, Vercel, Anthropic) | 30 a 45 min | Uso diario, con tu familia; se actualiza sola |
| **C. App nativa con Xcode** | Casita Stock como app de iPhone compilada, en el simulador o en tu iPhone | Apple ID; para IA y cuentas, las mismas de B | 30 min | Probar como app "de verdad" y preparar la App Store |

Recomendación: empieza con **A** para ver que todo abre, sigue con **B** (la guía `GUIA-INSTALACION.md`) y después **C**.

---

## Lo que necesitas instalar

### En la Mac

| App | Para qué | Cómo obtenerla | Costo |
|---|---|---|---|
| **macOS** reciente | Xcode 16 necesita macOS Sonoma 14.5 o más nuevo | Ajustes del Sistema → General → Actualización de software | Gratis |
| **Xcode 16 o más nuevo** | Compilar la app y abrir el simulador de iPhone | App Store → busca "Xcode" (pesa varios GB) | Gratis |
| **Herramientas de línea de comandos** | Git y compiladores | Se instalan con un comando (paso 1) | Gratis |
| Homebrew (opcional) | Instalar Node.js con un comando | brew.sh | Gratis |
| Node.js (opcional) | Solo para la opción A o si cambias el código de `web/`. **No hace falta para abrir en Xcode** desde la 1.2.1 | `brew install node` | Gratis |
| **Apple ID** | Firmar la app para instalarla en tu iPhone | El que ya usas en tu iPhone | Gratis |
| Visual Studio Code (opcional) | Editar el código cómodamente | code.visualstudio.com | Gratis |

### Solo si quieres publicar en la App Store o en TestFlight

| | Para qué | Costo |
|---|---|---|
| **Apple Developer Program** | Que la app no venza a los 7 días, instalarla en los teléfonos de tu familia con TestFlight y publicarla en la App Store | De pago, anual (revisa el precio en developer.apple.com) |

### En el iPhone

- iOS 14 o más nuevo; mejor uno reciente.
- Cable USB o USB‑C para conectarlo a la Mac la primera vez.
- Safari, para la opción B.

---

## Paso 1: Preparar la Mac (una sola vez)

1. Instala **Xcode** desde la App Store y ábrelo una vez. Acepta la licencia y deja que instale sus componentes.
2. En Xcode ve a **Settings → Components** (o *Platforms*) e instala el simulador de **iOS** si no está.
3. En Xcode ve a **Settings → Accounts → +** y agrega tu **Apple ID**.
4. Abre la app **Terminal** y pega estos comandos uno por uno:
   ```bash
   xcode-select --install
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   brew install node
   ```
   Al terminar Homebrew, puede pedirte copiar dos líneas que empiezan con `echo` y `eval`. Hazlo.
5. Revisa que todo quedó instalado:
   ```bash
   node -v    # debe decir v20 o más
   xcodebuild -version
   ```

## Paso 2: Bajar el proyecto

1. Descomprime `casita-stock.zip` en una carpeta, por ejemplo **Documentos/Proyectos/casita-stock**. Si ya está en GitHub, usa `git clone`.
2. En Terminal:
   ```bash
   cd ~/Documents/Proyectos/casita-stock
   npm install
   ```

---

## Opción A: simulador de iPhone con Safari (sin cuentas)

1. En Terminal, dentro de la carpeta del proyecto:
   ```bash
   npm run web
   ```
   Déjalo abierto: sirve la app en `http://localhost:8787`.
2. Abre el simulador: en Xcode, **Xcode → Open Developer Tool → Simulator**. Elige un iPhone en **File → Open Simulator**, por ejemplo iPhone 16 o iPhone SE para probar la pantalla chica.
3. En el simulador abre **Safari** y escribe `http://localhost:8787`.
4. La app abre en **modo demo**: los datos se guardan solo ahí y la IA está apagada. Ponle nombre al asistente y recorre las pantallas.
5. Para verla como app instalada: **Compartir → Añadir a pantalla de inicio**.

> En el simulador el micrófono depende del de tu Mac y puede no funcionar. La voz se prueba en un iPhone real.

## Opción B: app web en tu iPhone

Sigue **`GUIA-INSTALACION.md`**, pasos 1 al 5: Supabase, Anthropic, GitHub, Vercel e instalación desde Safari. Es la forma de usarla todos los días con tu familia.

---

## Opción C: app nativa con Xcode

### C.1 Conectar la app con tu servidor (para IA y cuentas)

La app de Xcode no tiene servidor propio: usa el de Vercel de la opción B.

1. Asegúrate de que Vercel tenga **esta versión del código** (1.2 o más nueva). Incluye el permiso para que la app nativa hable con el servidor.
2. Abre **`web/js/config-nativo.js`** y escribe tu dirección de Vercel:
   ```js
   window.CS_SERVIDOR = "https://casita-stock-web-ukbp.vercel.app";
   ```
   Sin "/" al final. Si lo dejas vacío, la app nativa abre en **modo demo**.
   Si no tienes Node.js, escribe lo mismo en **`ios/App/App/public/js/config-nativo.js`**, que es la copia que usa Xcode.

### C.2 Abrir el proyecto en Xcode

Desde la versión 1.2.1 **solo necesitas Xcode**:
1. Doble clic en **`abrir-en-xcode.command`** (la primera vez: clic derecho → Abrir), o abre directamente **`ios/App/App.xcodeproj`**.
2. Espera a que Xcode termine **"Resolving Package Graph"**: la primera vez descarga Capacitor de internet.
3. Revisa que en la columna izquierda no haya archivos en rojo.

Si cambiaste algo en `web/` y tienes Node.js, corre `npx cap copy ios` antes de ▶ (el `.command` lo hace solo).

### C.3 Firmar la app (una sola vez)

1. En Xcode, en la columna izquierda, toca el ícono azul **App**. Luego elige el target **App** → pestaña **Signing & Capabilities**.
2. Marca **Automatically manage signing**.
3. En **Team** elige tu Apple ID (aparece como *Personal Team*).
4. Cambia **Bundle Identifier** a algo único tuyo, por ejemplo `com.levijimenez.casitastock`. El que trae, `com.casitastock.app`, puede estar ocupado.

### C.4 Correrla en el simulador

1. Arriba, al lado de "App", elige un simulador, por ejemplo **iPhone 16**.
2. Toca **▶** (o `Cmd + R`). La primera vez tarda unos minutos.
3. Se abre Casita Stock como app. Entra con tu correo (te llega el código), crea o únete a tu casa y ponle nombre al asistente.

### C.5 Correrla en tu iPhone real

1. Conecta el iPhone con el cable. En el iPhone toca **Confiar** en esta computadora.
2. Activa el **Modo de desarrollador** en el iPhone: **Ajustes → Privacidad y seguridad → Modo de desarrollador → activar**. Se reinicia; confirma al encender. Si no aparece la opción, aparece después de intentar correr la app una vez desde Xcode.
3. En Xcode, arriba, elige **tu iPhone** como destino y toca **▶**.
4. La primera vez el iPhone dirá *"Desarrollador no confiable"*. Ve a **Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar** y abre la app otra vez.
5. Al usar el asistente, acepta los permisos de **Micrófono** y **Reconocimiento de voz**. Al escanear, acepta el de **Cámara**.
6. Después del primer cable, puedes correrla por Wi‑Fi: en Xcode ve a **Window → Devices and Simulators**, elige tu iPhone y marca **Connect via network**.

> **Con Apple ID gratuito la app deja de abrir a los 7 días.** Conecta el iPhone y toca ▶ otra vez para renovarla. Con el Apple Developer Program dura un año y puedes usar TestFlight para tu familia.

### C.6 Cada vez que cambies el código

```bash
npx cap copy ios
```
Luego toca **▶** en Xcode. Para la app web, sube los cambios a GitHub y Vercel los publica solo.

---

## Ver errores (depuración)

- **App de Xcode:** abajo en Xcode está la consola con los mensajes de la app.
- **Ver la app por dentro con Safari de la Mac:** en Safari ve a **Ajustes → Avanzado** y marca **"Mostrar funciones para desarrolladores web"**. Luego, con la app abierta en el simulador o el iPhone, ve a **Desarrollar → [tu iPhone o simulador] → Casita Stock**.
- **App web en el iPhone:** activa **Ajustes → Safari → Avanzado → Inspector web** y usa el mismo menú **Desarrollar** de la Mac.

## Problemas comunes

| Problema | Solución |
|---|---|
| Archivos en rojo en Xcode | Estás usando la carpeta de la 1.2. Descomprime la versión más nueva en una carpeta nueva y abre `ios/App/App.xcodeproj`. |
| "Missing package product 'CapApp-SPM'" o paquetes que no bajan | Revisa internet; luego **File → Packages → Reset Package Caches**. |
| "Signing for App requires a development team" | Toca el ícono azul **App** → target **App** → **Signing & Capabilities** → elige tu **Team** (tu Apple ID). Si no aparece, agrégalo en **Xcode → Settings → Accounts → +**. |
| Aviso "Update to recommended settings" | Es solo un aviso. Tócalo y luego **Perform Changes**; no afecta la app. |
| "No profiles for…" o errores de firma | Revisa C.3: elige tu Team y cambia el Bundle Identifier por uno único. |
| "Developer Mode disabled" | Activa el Modo de desarrollador (C.5 paso 2). |
| "Desarrollador no confiable" | Ajustes → General → VPN y gestión de dispositivos → Confiar. |
| La app nativa dice "Modo demo" | `config-nativo.js` está vacío, o Vercel no tiene la versión 1.2. Corrígelo también en `ios/App/App/public/js/config-nativo.js` (o corre `npx cap copy ios`) y toca ▶. |
| "Falta permiso" al hablar | Ajustes del iPhone → **Casita Stock** → activa Micrófono y Reconocimiento de voz. |
| El micrófono no funciona en el simulador | Pruébalo en el iPhone real. |
| No llega el código del correo | Ver `GUIA-INSTALACION.md`, sección "Si algo no funciona". |
| "Descargar inventario (Excel)" no hace nada en la app de Xcode | En esta versión la descarga funciona en la app web; hazlo desde Safari. |
| Pantalla negra al abrir y en la consola dice "UIScene life cycle is required" | Usa la versión 1.2.3 o más nueva: ya trae el ciclo de vida con escenas que exige iOS 26. |
| Pantalla blanca al abrir | Corre `npx cap copy ios` (o vuelve a descomprimir el zip). Si sigue, revisa la consola de Xcode o Safari → Desarrollar. |

## Diferencias entre la app web y la app de Xcode

| | App web (Safari) | App de Xcode (nativa) |
|---|---|---|
| Instalación | "Añadir a pantalla de inicio" | Desde Xcode; luego TestFlight o App Store |
| Actualizaciones | Solas al publicar en Vercel | Hay que compilar e instalar otra vez |
| Voz | Reconocimiento de Safari | Reconocimiento nativo del iPhone (más estable) |
| Cámara, IA, familia | Sí | Sí, usando tu servidor de Vercel |
| Sin conexión | Abre con la última copia | Abre siempre; los datos necesitan conexión |
| Siri | Atajo "Abrir URL" | Atajo "Abrir app → Casita Stock" |

## Para quien mantiene el código

- `package.json` y `capacitor.config.json` en la raíz definen la app nativa: Capacitor 7, `webDir: "web"`, appId `com.casitastock.app`.
- `ios/`: proyecto de Xcode. Los permisos están en `ios/App/App/Info.plist` (cámara, fotos, micrófono, reconocimiento de voz), la app es solo vertical y tiene el ícono en `Assets.xcassets`. `ios/App/App/public` es la copia de `web/` y sí se guarda, para abrir sin Node. Capacitor llega por Swift Package Manager (`ios/App/CapApp-SPM`), sin CocoaPods.
- Voz nativa: plugin `SpeechRecognition` dentro de `ios/App/App/MainViewController.swift` (basado en `@capacitor-community/speech-recognition` 7.0.1, MIT); lo usa `web/js/voz.js`, que termina de escuchar tras 1,5 s de silencio.
- `web/vendor/`: Supabase y el lector de códigos van dentro de la app, sin depender de internet para cargarlos.
- Servidor: `web/api/ia.js` y `web/api/config.js` aceptan llamadas solo desde `capacitor://localhost` (la app nativa) y desde la propia web.
