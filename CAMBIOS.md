# Casita Stock — historial de cambios

## Versión 1.3.6 — 11 de noviembre de 2026
> Mensajes claros cuando la llave de la IA falla, y la llave se limpia sola.

### Qué cambió
- **El servidor limpia la llave de Anthropic** si se pegó con espacios, saltos de línea o comillas.
- **Mensajes exactos según el problema:** llave no aceptada por Anthropic, llave sin permiso, cuenta sin créditos o modelo no disponible. Antes todos decían "Revisa la llave de la API en Vercel".
- **Registro en Vercel:** cada error de Anthropic queda en Vercel → proyecto → **Logs** como `[ia] Anthropic 401 bad_key: …`.

### Cómo probar esta versión
1. Sube esta versión a GitHub (`alphadrilo/casita-stock`), reemplazando los archivos. Vercel publica solo el proyecto **casita-stock-web-ukbp**.
2. En Xcode: descomprime `casita-stock-v1.3.6.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, **Product → Clean Build Folder** y ▶.
3. En la app, prueba el asistente. Si falla, el mensaje dice qué revisar.

### Ten en cuenta
- Si el mensaje dice que Anthropic no acepta la llave: crea una nueva en console.anthropic.com → API Keys, edítala en Vercel (Settings → Environment Variables → `ANTHROPIC_API_KEY` → Edit) y haz **Redeploy**.
- La versión de Safari también queda con la entrada por correo y contraseña al subir esta versión a GitHub.

### Detalles técnicos
- `api/ia.js`: `LLAVE()` recorta espacios y comillas. 401 → `bad_key`, 403 → `key_forbidden`, 400 con "credit" → `no_credits`, 404 de modelo → `model_unavailable`; `console.error` con el código y el mensaje de Anthropic.
- `app.js`: textos nuevos en `AI_ERR`; esos códigos apagan la IA hasta reabrir. Versión 1.3.6 (build 1).

## Versión 1.3.5 — 10 de noviembre de 2026
> La app de Xcode usa el proyecto de Vercel que ya tiene todo configurado: `https://casita-stock-web-ukbp.vercel.app`.

### Qué cambió
- **Servidor:** `casita-stock-web-ukbp.vercel.app`. Revisado el 10 de noviembre: tiene la dirección de Supabase, la llave `anon` y la IA encendida.

### Cómo probar esta versión
1. Descomprime `casita-stock-v1.3.5.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, elige tu Team y el mismo Bundle Identifier, **Product → Clean Build Folder** y ▶.
2. En la app: **Crear cuenta** con tu correo y una contraseña de al menos 8 letras o números. Crea tu casa y ponle nombre al asistente. Arriba debe decir "En la nube".
3. Prueba el asistente y **Agregar → Escanear factura**.

### Ten en cuenta
- En Supabase, **Authentication → Sign In / Providers → Email → "Confirm email"** debe estar apagado.
- El proyecto `casita-stock-web` (sin "-ukbp") quedó repetido y sin variables. Se puede borrar en Vercel → ese proyecto → Settings → Delete Project.
- Para que la versión de Safari también entre con contraseña, sube esta versión a GitHub (`alphadrilo/casita-stock`).

### Detalles técnicos
- `web/js/config-nativo.js`: `CS_SERVIDOR = "https://casita-stock-web-ukbp.vercel.app"`. Versión 1.3.5 (build 1).

## Versión 1.3.4 — 10 de noviembre de 2026
> La app de Xcode apunta a tu servidor real: `https://casita-stock-web.vercel.app`.

### Qué cambió
- **Nueva dirección del servidor.** Vercel le dio a tu proyecto la dirección `casita-stock-web.vercel.app` (la anterior, `casita-stock.vercel.app`, no es tuya). La app de Xcode ya la usa.

### Cómo probar esta versión
1. En Vercel → proyecto **casita-stock** → **Settings → Environment Variables**, revisa que estén exactamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `ANTHROPIC_API_KEY`, y luego **Deployments → ⋯ → Redeploy**.
2. Abre `https://casita-stock-web.vercel.app/api/config`: debe mostrar tu dirección de Supabase, una llave larga y `"ia":true`.
3. Descomprime `casita-stock-v1.3.4.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, elige tu Team y el mismo Bundle Identifier, **Product → Clean Build Folder** y ▶.
4. En la app: **Crear cuenta** con tu correo y una contraseña.

### Ten en cuenta
- Las variables nuevas de Vercel solo se aplican después de **Redeploy**.

### Detalles técnicos
- `web/js/config-nativo.js`: `CS_SERVIDOR = "https://casita-stock-web.vercel.app"`. Guías actualizadas con la dirección nueva. Versión 1.3.4 (build 1).

## Versión 1.3.3 — 10 de noviembre de 2026
> Entrar con correo y contraseña, sin depender de correos de Supabase.

### Qué cambió
- **Nueva forma de entrar:** "Crea tu cuenta" con tu correo y una contraseña (al menos 8 letras o números), y luego "Ya tengo cuenta: entrar". Botón "Ver" para revisar la contraseña.
- **Ya no se envían correos con código.** Supabase ahora pide configurar un servidor de correo (SMTP) para cambiar sus plantillas, y su correo gratis solo llega a la cuenta del dueño, no a la familia. Con contraseña, nadie necesita correo.
- **Mensajes claros** si la contraseña es incorrecta, si el correo ya tiene cuenta o si en Supabase falta apagar "Confirm email".

### Cómo probar esta versión
1. En Supabase: **Authentication → Sign In / Providers → Email**: deja Email encendido, **apaga "Confirm email"** y toca **Save**. Revisa que "Allow new users to sign up" esté encendido.
2. En Vercel, el proyecto debe estar publicado con Root Directory `web` y las 3 variables. Comprueba `https://casita-stock.vercel.app/api/config` (tu Supabase y `"ia":true`).
3. Descomprime `casita-stock-v1.3.3.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, elige tu Team y el mismo Bundle Identifier, **Product → Clean Build Folder** y ▶.
4. En la app: **Crear cuenta** con tu correo y una contraseña, crea tu casa y prueba.

### Ten en cuenta
- Si alguien olvida su contraseña, se resuelve desde Supabase → Authentication → Users (guía de instalación, paso 1).
- La versión de Safari también entra con contraseña cuando subas esta versión a GitHub.

### Detalles técnicos
- `plataforma.js`: `pasoLogin` usa `auth.signUp` y `auth.signInWithPassword` (antes `signInWithOtp` y `verifyOtp`). Detecta correo ya registrado por `identities` vacío y sesión ausente (confirmación de correo encendida).
- Guía de instalación: paso 1 cambia la plantilla de correo por "Confirm email" apagado.
- Versión 1.3.3 (build 1).

## Versión 1.3.2 — 7 de noviembre de 2026
> Si la app queda en modo demo, ahora dice por qué y cómo arreglarlo.

### Qué cambió
- **El aviso de "Modo demo" explica la causa.** En Ajustes (engranaje) aparece "Por qué:" con uno de estos motivos:
  - No se pudo conectar con el servidor (sin internet, dirección mal escrita, o Vercel con una versión anterior a la 1.2).
  - El servidor respondió 404: Vercel no tiene la app (Root Directory distinto de "web" o repositorio equivocado).
  - Faltan `SUPABASE_URL` o `SUPABASE_ANON_KEY` en Vercel.
- **Botón "Probar la conexión otra vez"** en Ajustes, para revisar sin volver a compilar.
- **Mensaje en la consola de Xcode:** `[Casita Stock] Modo demo: …` con el mismo motivo.

### Cómo probar esta versión
1. Descomprime `casita-stock-v1.3.2.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, elige tu Team y el mismo Bundle Identifier, **Product → Clean Build Folder** y ▶.
2. Si la app dice modo demo, toca el engranaje y lee "Por qué:". Corrige lo que indica en Vercel y toca **Probar la conexión otra vez**.
3. Si ya no dice demo, te pide tu correo: entra, crea tu casa y prueba el escáner de facturas.

### Ten en cuenta
- Los mensajes de la consola de Xcode como "sandbox_extension", "Couldn't open <private>" o "JS Eval error" los muestra iOS y no son errores de Casita Stock.
- Sube también esta versión a GitHub para que Vercel quede igual que la app.

### Detalles técnicos
- `plataforma.js`: `motivoDemo` distingue sin dirección, error de red o CORS, respuesta no 200 (404 aparte), respuesta que no es JSON y variables vacías; se muestra en Ajustes y con `console.error`. "Probar la conexión otra vez" borra `cs-config` y recarga.
- Versión 1.3.2 (build 1).

## Versión 1.3.1 — 5 de noviembre de 2026
> La app de Xcode ya está conectada a tu servidor: cuentas, IA y escáner de facturas.

### Qué cambió
- **Conectada a `https://casita-stock.vercel.app`.** La app de Xcode deja el modo demo y usa tu servidor para la IA y para saber dónde está tu base de datos de Supabase.
- Desde ahora entras con tu correo y el código que te llega, creas tu casa (o te unes con el código de la familia) y todo se guarda en la nube.

### Cómo probar esta versión
1. Primero revisa tu servidor: abre `https://casita-stock.vercel.app/api/config` en Safari. Debe mostrar tu dirección de Supabase y `"ia":true`. Si dice `"ia":false`, falta `ANTHROPIC_API_KEY` en Vercel.
2. Revisa que Vercel tenga la versión 1.3: abre `https://casita-stock.vercel.app/js/facturas.js`. Si sale "404", sube la 1.3 (o esta 1.3.1) a GitHub.
3. Descomprime `casita-stock-v1.3.1.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, elige tu Team y el mismo Bundle Identifier, **Product → Clean Build Folder** y ▶.
4. Entra con tu correo y el código, crea tu casa y ponle nombre al asistente. Arriba debe decir "En la nube" y en Ajustes "Casita Stock 1.3.1".
5. Prueba el asistente y **Agregar → Escanear factura** con una factura real.

### Ten en cuenta
- Si la app dice "No se pudo abrir", revisa el paso 1 y tu conexión.
- Si el código no llega al correo, revisa la carpeta de spam y la plantilla de correo en Supabase (guía de instalación, paso 1).
- Para traer tus productos de antes: Ajustes → Importar una copia (.json), con el archivo `importar.json`.

### Detalles técnicos
- `web/js/config-nativo.js`: `CS_SERVIDOR = "https://casita-stock.vercel.app"`. Solo lo usa la app nativa; la versión de Safari llama a su propio servidor.
- El servidor ya acepta llamadas desde `capacitor://localhost` (CORS) desde la versión 1.2. Versión 1.3.1 (build 1).

## Versión 1.3 — 4 de noviembre de 2026
> Escáner inteligente de facturas: fotografía la factura del supermercado y la IA agrega todo a tu inventario.

### Qué hay de nuevo
- **Escanear factura.** Botón nuevo en Agregar, y también en Compras y en el Historial. Toma fotos con la cámara, elige fotos de la galería o sube el PDF. Una factura puede tener varias páginas.
- **La IA lee la factura completa.** Supermercado, fecha, cada producto, cantidad, precio por unidad, total de la línea, descuentos, impuestos y total pagado. Entiende las abreviaturas de Costco, Sam's Club, Stop & Shop, ShopRite, Walmart, Target y otros.
- **Compara con lo que ya tienes.** Cada producto aparece como "Se suma a lo que tienes", "Producto nuevo" o "Revisa este producto" cuando la IA tiene dudas. Las líneas repetidas se unen, así no se duplica nada.
- **Tú confirmas antes de guardar.** Puedes cambiar a qué producto corresponde cada línea, corregir el nombre, la cantidad y el precio, y quitar lo que no va. Los productos marcados para revisar piden "Está bien así". El inventario no cambia hasta que tocas Guardar.
- **Aprende tus facturas.** La próxima vez que salga "KS PAPER TOWEL", ya sabe que son tus Toallas de papel.
- **Avisa si la factura ya se guardó**, para no sumarla dos veces, y si la suma de los productos no coincide con el subtotal.
- **Lo que compraste sale de tu lista de compras.**
- **Historial de compras.** Cada factura, compra grande o lista terminada queda guardada con fecha, supermercado, productos, cantidades, precios y total. Se puede abrir para ver el detalle.
- **Análisis de gastos.** Gastos por semana, por mes y por supermercado, lo que más compras, los cambios de precio y en qué supermercado sale más barato cada producto. Se filtra por este mes, 3 meses, este año o todo.
- **Sincronizado con tu familia**, como el inventario y la lista.

### Cómo probar esta versión
1. **Publica la 1.3 en Vercel** (sube el código a GitHub). El escáner necesita el servidor con IA; en modo demo te ofrece registrar la compra a mano.
2. En la app de Xcode: descomprime `casita-stock-v1.3.zip` en una carpeta nueva, abre `ios/App/App.xcodeproj`, elige tu Team y el mismo Bundle Identifier, **Product → Clean Build Folder** y ▶. En Ajustes debe decir "Casita Stock 1.3".
3. En **Agregar** toca **Escanear factura** → **Tomar foto**. Pon la factura sobre una mesa con buena luz. Si es larga, toma varias fotos de arriba hacia abajo.
4. Toca **Leer factura** y espera (puede tardar hasta un minuto).
5. Revisa la lista: corrige lo necesario, confirma los marcados para revisar y toca **Guardar**.
6. Mira el **Inventario** (cantidades sumadas) y en **Asistente → Historial de compras y gastos** la compra y tus gastos.
7. Escanea la misma factura otra vez: debe avisar que ya está guardada.

### Ten en cuenta
- La lectura usa la IA de tu cuenta de Anthropic: una factura con fotos cuesta más que una pregunta normal.
- Fotos de hasta 20 tramos y PDF de hasta 3 MB por lectura. Si la factura es muy larga, léela en dos partes.
- Borrar una compra del historial no cambia tu inventario.
- Probado en iPhone SE y iPhone 13 simulados con IA y base de datos simuladas (45 pruebas). Todavía no se probó con facturas reales en un iPhone: si alguna sale mal leída, envía una foto para ajustarlo.

### Detalles técnicos
- Archivo nuevo `web/js/facturas.js`: captura y cortado de fotos largas (tramos de 1568 px con 6 % de traslape, recompresión si pasan de 4 MB), lectura con `sample.json` (`files`, `maxTokens: 8000`, modelo estándar, cancelable), comparación (alias de factura, código, `productoId` de la IA, nombre), revisión, guardado sin duplicados y con reintento seguro, historial y estadísticas.
- `plataforma.js`: `sample()` acepta `files` (imágenes y PDF como bloque `document`) y `maxTokens`. Copias JSON (importar y exportar) incluyen `compras`.
- `api/ia.js`: tope de respuesta de 8000 tokens y cuerpo de 4,4 MB. `vercel.json`: `maxDuration` 60 s para `api/ia.js`.
- `app.js`: colección `compras` (nube y modo demo), `applyPurchase` guarda `cid`, la compra grande y la lista guardan su compra, accesos al escáner y al historial.
- Base de datos: sin tablas nuevas. `compras` vive en `documentos` con las mismas reglas de acceso (RLS) y tiempo real.
- Íconos nuevos: factura y tendencia a la baja. Versión 1.3 (build 1).

## Versión 1.2.4 — 3 de noviembre de 2026
> Casita Stock estrena tu ícono: la casita con el carrito, la lista y el nombre.

### Qué hay de nuevo
- **Ícono nuevo en la app de iPhone.** La casa azul con la ventana naranja, el carrito, la lista con palomitas verdes y "Casita Stock" en azul y naranja. Se redibujó a 1024 × 1024 para que se vea nítido en el iPhone (la imagen enviada medía 132 × 132 y se veía borrosa al agrandarla).
- **Pantalla de inicio nueva.** Al abrir la app aparece el logo sobre fondo blanco.
- **Mismo ícono en la app web.** Al usar "Añadir a pantalla de inicio" en Safari, y en la pestaña del navegador.
- **El PDF de cambios** también usa el ícono nuevo.

### Cómo probar esta versión
1. Cierra Xcode y descomprime `casita-stock-v1.2.4.zip` en una carpeta nueva.
2. Abre `ios/App/App.xcodeproj` y espera a que termine "Resolving Package Graph".
3. En **Signing & Capabilities** elige tu **Team** y el mismo **Bundle Identifier** de antes.
4. **Borra la app Casita Stock del iPhone** (mantén presionado el ícono → Eliminar app). iOS a veces guarda el ícono anterior.
5. **Product → Clean Build Folder**, elige **iPhone Levi** y toca **▶**.
6. Revisa el ícono en la pantalla de inicio y el logo al abrir. En Ajustes de la app debe decir "Casita Stock 1.2.4 · app de iPhone".

### Ten en cuenta
- El iPhone redondea las esquinas solo. Por eso el ícono va cuadrado y blanco, sin el borde ni la sombra de la imagen original.
- Si tienes el archivo original del logo en tamaño grande (1024 × 1024 o más), envíalo y lo uso tal cual en lugar del redibujo.
- En la app web, el ícono nuevo aparece al quitar la app de la pantalla de inicio y volver a añadirla desde Safari.

### Detalles técnicos
- Fuente del ícono en vector: `web/icons/icono.svg` (Poppins Bold, azul #15325a, naranja #f68b1f, verde #34a853), renderizado a 2048 px.
- Generados: `AppIcon.appiconset/AppIcon-512@2x.png` (1024, sin transparencia), `Splash.imageset` (2732, logo de 1000 px centrado en blanco), `web/icons/` icon-512, icon-192, apple-touch-icon (180), favicon (64) e icon-maskable-512 (logo al 80 %).
- `web/sw.js` guarda también `icon-maskable-512.png`. Versión 1.2.4 (build 1).

## Versión 1.2.3 — 3 de noviembre de 2026
> Corrige la pantalla negra al abrir la app en el iPhone.

### Qué se corrigió
- **Pantalla negra al abrir.** Con Xcode y el sistema de iOS 26, Apple exige que las apps usen "escenas" (UIScene) para abrir su ventana. La app usaba el método anterior y se quedaba en negro con el mensaje "UIScene life cycle is required for apps built with this SDK". Ahora usa escenas y abre la pantalla de Casita Stock.
- **Un aviso menos en Xcode.** Se quitó el aviso de `OpenURLOptionsKey` en `AppDelegate`. Los avisos amarillos de la voz (`requestRecordPermission`, `installTap`) son funciones viejas que siguen funcionando.

### Cómo probar esta versión
1. Cierra Xcode y descomprime `casita-stock-v1.2.3.zip` en una carpeta nueva.
2. Abre `ios/App/App.xcodeproj` y espera a que termine "Resolving Package Graph".
3. **Signing & Capabilities:** vuelve a elegir tu **Team** y el mismo **Bundle Identifier** que usaste antes. Si usas el mismo, el iPhone no te pide confiar otra vez.
4. **Product → Clean Build Folder**, elige **iPhone Levi** arriba y toca **▶**.
5. Debe aparecer el ícono verde y luego "Abriendo Casita Stock…" y la pantalla para ponerle nombre al asistente. En Ajustes de la app debe decir "Casita Stock 1.2.3 · app de iPhone".

### Ten en cuenta
- Sin la dirección de Vercel en `config-nativo.js`, la app abre en **modo demo** (sin IA ni cuentas). Es normal en esta prueba.
- Si sigue en negro, abre la consola de Xcode (Shift + Cmd + C) y envía una foto, como la última vez.

### Detalles técnicos
- `Info.plist`: nuevo `UIApplicationSceneManifest` (una sola escena, `$(PRODUCT_MODULE_NAME).SceneDelegate`, storyboard `Main`). Se quitó `UIMainStoryboardFile`.
- `AppDelegate.swift`: agrega `configurationForConnecting` y la clase `SceneDelegate` (`UIWindowSceneDelegate`), que pasa enlaces y actividades a `ApplicationDelegateProxy` de Capacitor. Se quitó `window` del AppDelegate.
- Versión 1.2.3 (build 1).

## Versión 1.2.2 — 3 de noviembre de 2026
> Corrige el error "Cannot find 'SpeechRecognition' in scope" al compilar en Xcode.

### Qué se corrigió
- **Error de la voz en Xcode.** Xcode no encontraba el reconocimiento de voz desde `MainViewController`. Ahora el plugin de voz y la pantalla principal están en el mismo archivo, `MainViewController.swift`, así que Xcode siempre lo encuentra.
- **Guía con los avisos de firma.** `GUIA-XCODE-IPHONE.md` explica qué hacer con "Signing for App requires a development team" y con el aviso "Update to recommended settings".

### Cómo probar esta versión
1. Cierra Xcode y descomprime `casita-stock-v1.2.2.zip` en una carpeta nueva. No uses las carpetas de la 1.2 ni de la 1.2.1.
2. Abre `ios/App/App.xcodeproj` (o doble clic en `abrir-en-xcode.command`) y espera a que termine "Resolving Package Graph".
3. Toca el ícono azul **App** → target **App** → **Signing & Capabilities** → elige tu **Team**. Cambia el **Bundle Identifier**, por ejemplo `com.levijimenez.casitastock`.
4. Si aparece el aviso amarillo "Update to recommended settings", tócalo y luego **Perform Changes**.
5. Menú **Product → Clean Build Folder**, elige un iPhone arriba y toca **▶**.
6. En Ajustes de la app debe decir "Casita Stock 1.2.2 · app de iPhone".

### Ten en cuenta
- Si no aparece ningún Team, agrega tu Apple ID en **Xcode → Settings → Accounts → +**.
- Si Xcode muestra otro error, toca el ⨯ rojo y envía una captura de la lista.

### Detalles técnicos
- `ios/App/App/SpeechRecognition.swift` se unió a `MainViewController.swift` y se quitó del proyecto (`project.pbxproj`). Mismo código del plugin (`CAPBridgedPlugin`, registrado en `capacitorDidLoad()`).
- Versión 1.2.2 (build 1).

## Versión 1.2.1 — 2 de noviembre de 2026
> Ahora el proyecto abre y compila en Xcode sin instalar nada más que Xcode.

### Qué se corrigió
- **Ya no salen archivos en rojo en Xcode.** En la 1.2, `capacitor.config.json`, `config`, `public` y los archivos `Pods-App` no existían hasta correr un paso de preparación en la Terminal, y por eso Xcode decía "Build Failed". Ahora el proyecto los trae listos.
- **Ya no necesitas CocoaPods ni Node.js.** Capacitor se descarga solo dentro de Xcode (Swift Package Manager), y el reconocimiento de voz del iPhone va dentro de la app.
- **`abrir-en-xcode.command` más simple.** Solo revisa que tengas Xcode y abre el proyecto. Si tienes Node.js, además copia los cambios de `web/`.
- **Se abre `App.xcodeproj`** (ícono azul). Ya no existe `App.xcworkspace`.

### Cómo probar esta versión
1. Cierra Xcode. **No uses la carpeta de la 1.2**: descomprime `casita-stock-v1.2.1.zip` en una carpeta nueva.
2. Haz doble clic en `abrir-en-xcode.command` (la primera vez: clic derecho, luego Abrir). También puedes abrir directamente `ios/App/App.xcodeproj`.
3. Espera a que Xcode termine **"Resolving Package Graph"**. La primera vez descarga Capacitor de internet y tarda uno o dos minutos.
4. Revisa que en la columna izquierda **no haya archivos en rojo**.
5. Toca el ícono azul **App** → target **App** → **Signing & Capabilities**: elige tu **Team** y cambia el **Bundle Identifier**, por ejemplo `com.levijimenez.casitastock`.
6. Arriba elige un simulador de iPhone y toca **▶**. En Ajustes de la app debe decir "Casita Stock 1.2.1 · app de iPhone".
7. Prueba el micrófono del asistente en un iPhone real: debe pedir permiso de Micrófono y de Reconocimiento de voz.

### Ten en cuenta
- La primera vez Xcode necesita internet para descargar Capacitor desde GitHub.
- Si Xcode dice "Missing package product 'CapApp-SPM'": menú **File → Packages → Reset Package Caches** y espera.
- Esta versión todavía no se compiló en una Mac real. Si Xcode muestra un error, toca el ⨯ rojo y envía una captura de la lista.

### Detalles técnicos
- iOS regenerado con `npx cap add ios --packagemanager SPM` (Capacitor 7.6.9). `ios/App/CapApp-SPM` depende de `capacitor-swift-pm` 7.6.9. Sin Podfile ni workspace.
- Se quitó la dependencia npm `@capacitor-community/speech-recognition`. Su código Swift (MIT) vive en `ios/App/App/SpeechRecognition.swift`, ahora con `CAPBridgedPlugin` y sin el archivo `.m`.
- `ios/App/App/MainViewController.swift` (subclase de `CAPBridgeViewController`) registra el plugin en `capacitorDidLoad()` con `registerPluginInstance`. `Main.storyboard` usa esa clase.
- `ios/App/App/public`, `capacitor.config.json` y `config.xml` ahora se guardan en el repositorio y en el zip. Después de cambiar `web/`, correr `npx cap copy ios`.
- `Info.plist`, el ícono y la pantalla de inicio se conservaron de la 1.2. Versión 1.2.1 (build 1).

## Versión 1.2 — 1 de noviembre de 2026
> Casita Stock ya se puede abrir y compilar en Xcode como una app de iPhone de verdad.

### Qué hay de nuevo
- **App de iPhone en Xcode.** El proyecto trae la carpeta `ios/` con todo lo necesario para correr Casita Stock en el simulador o en tu iPhone desde Xcode. Es la misma app que ya conoces, ahora dentro de una app nativa.
- **Abrir en Xcode con doble clic.** El archivo `abrir-en-xcode.command` revisa que tengas todo instalado, prepara el proyecto y abre Xcode.
- **Voz con el reconocimiento del iPhone.** Dentro de la app de Xcode, el asistente escucha con el reconocimiento de voz del propio iPhone, más estable que el de Safari, y deja de escuchar solo cuando terminas de hablar.
- **Conectada a tu servidor.** La app de Xcode usa tu servidor de Vercel para la IA y las cuentas de la familia. Solo escribes tu dirección en `web/js/config-nativo.js`.
- **Abre sin depender de internet.** Las librerías de la base de datos y del lector de códigos ahora van dentro de la app.
- **Permisos en español.** La primera vez, el iPhone pide permiso para la cámara, las fotos, el micrófono y el reconocimiento de voz, con textos claros.
- **Con cara de app.** Ícono y pantalla de inicio de Casita Stock, y solo en vertical, como se usa con una mano.
- **Guía nueva.** `GUIA-XCODE-IPHONE.md` explica qué instalar en la Mac y cómo probar en el simulador y en tu iPhone.

### Cómo probar esta versión
1. Instala en la Mac Xcode (App Store), Node.js y CocoaPods. Los comandos están en la guía `GUIA-XCODE-IPHONE.md`, paso 1.
2. Descomprime `casita-stock-v1.2.zip` en una carpeta, por ejemplo Documentos/Proyectos.
3. Opcional, para tener IA y cuentas: escribe tu dirección de Vercel en `web/js/config-nativo.js`. Sin ella, la app abre en modo demo.
4. Haz doble clic en `abrir-en-xcode.command`. La primera vez macOS lo bloquea: clic derecho, luego Abrir.
5. En Xcode toca el ícono azul App, ve a Signing & Capabilities, elige tu Team (tu Apple ID) y cambia el Bundle Identifier por uno tuyo, por ejemplo com.levijimenez.casitastock.
6. Arriba elige un simulador (iPhone 16) o tu iPhone conectado, y toca ▶.
7. Prueba: ponle nombre al asistente, escanea un producto, dile al asistente "compré 2 cartones de huevos", di "sí" y toca "Usé 1" en el inventario.

### Ten en cuenta
- Con un Apple ID gratuito, la app instalada desde Xcode deja de abrir a los 7 días. Se renueva conectando el iPhone y tocando ▶ otra vez.
- Dentro de la app de Xcode, "Descargar inventario (Excel)" puede no funcionar. Desde Safari sí funciona.
- Para que la IA funcione en la app de Xcode, Vercel debe tener publicada esta versión 1.2.
- Esta versión se probó en un iPhone simulado, pero todavía no se compiló en una Mac real. Si Xcode muestra un error, envía una captura para corregirlo.

### Detalles técnicos
- Capacitor 7.6.9 con CocoaPods. Plugin de voz `@capacitor-community/speech-recognition` 7.0.1. Identificador `com.casitastock.app`, versión 1.2 (build 1), iOS 14 o más nuevo.
- `web/js/config-nativo.js` define `CS_SERVIDOR`. `plataforma.js` envía `/api/config` y `/api/ia` a esa dirección cuando corre en nativo, y no registra el service worker.
- `web/api/ia.js` y `web/api/config.js` aceptan llamadas desde `capacitor://localhost` (CORS) y responden a OPTIONS. Otros orígenes no reciben permiso.
- `voz.js`: nueva función `escucharNativo` con permisos, resultados parciales, corte tras 1,5 s de silencio y máximo de 20 s.
- `web/vendor/`: supabase-js 2.45.4 y @zxing/library 0.21.3, también guardados por el service worker.
- `Info.plist`: NSCameraUsageDescription, NSPhotoLibraryUsageDescription, NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription, ITSAppUsesNonExemptEncryption = NO, solo vertical.
- Archivos nuevos: `ios/`, `package.json`, `capacitor.config.json`, `abrir-en-xcode.command`, `GUIA-XCODE-IPHONE.md`, `CAMBIOS.md`.

## Versión 1.1.1 — 30 de octubre de 2026
> Adaptada y revisada para iPhone.

### Qué hay de nuevo
- **Regla del proyecto:** todo se diseña y se prueba para iPhone, con una lista de verificación en `CLAUDE.md`.
- **Botones y opciones de al menos 44 pt**, el tamaño que pide Apple para tocar con el pulgar.
- **El teclado ya no tapa** la ficha, los ajustes ni el asistente.
- **Sin zoom accidental** al tocar dos veces, y sin el menú de copiar al mantener presionado.
- **Códigos y precios sin autocorrección.**
- **Asistente más cómodo en el iPhone SE.**

## Versión 1.1 — 30 de octubre de 2026
> Unidades por paquete: huevos, latas, rollos y todo lo que viene en cartón, caja o paquete.

### Qué hay de nuevo
- **El inventario cuenta unidades sueltas.** La primera vez se pregunta cuántas trae cada paquete y cómo se llama cada unidad.
- **Compra por paquetes:** "2 cartones = 24 huevos", con el precio por cartón y por unidad.
- **Varios tamaños, un solo producto:** cartones de 12 y de 30 con códigos distintos suman a "Huevos".
- **"Usé 1" descuenta una unidad**, y el inventario muestra "53 huevos · 4 cartones y 5 huevos".
- **Lista de compras, compra grande, ficha y asistente** entienden paquetes y docenas.

## Versión 1.0 — 23 de octubre de 2026
> Primera versión instalable fuera de Claude.

### Qué hay de nuevo
- **App instalable en el iPhone** desde Safari, que funciona sin conexión con la última copia.
- **Cuentas con correo y código** y **familia por código de invitación**, con datos en Supabase y cambios en tiempo real.
- **Asistente de voz con el nombre que elijas:** consulta el inventario en vivo, propone cambios y guarda cuando dices "sí".
- **Productos nuevos** con código o foto (la IA lee la etiqueta), lista de compras, vencimientos, gastos y análisis con IA.
- **Servidor seguro para la IA:** la llave nunca llega al teléfono.
- **Importar los datos** de la versión anterior dentro de Claude.
