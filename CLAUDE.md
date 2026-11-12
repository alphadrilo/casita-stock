# Casita Stock — reglas del proyecto

## Regla principal: todo es para iPhone
Casita Stock se usa en iPhone (app instalada desde Safari con "Añadir a pantalla de inicio"). Todo cambio, pantalla, texto o función se diseña, se adapta y se prueba para iPhone antes de entregarse.

### Lista de verificación para cada cambio
- **Tamaño de pantalla:** se ve bien en iPhone SE (375 pt de ancho) hasta iPhone Pro Max (430 pt). Nada se sale por los lados ni obliga a hacer zoom.
- **Zonas seguras:** respeta el notch o la isla dinámica arriba y la barra de inicio abajo (`env(safe-area-inset-*)`). Los botones fijos abajo quedan por encima de la barra de inicio.
- **Toques:** todo lo que se toca mide al menos 44 × 44 pt (guía de Apple). Las acciones principales van abajo, al alcance del pulgar. Nada depende de pasar el mouse por encima.
- **Teclado:** los campos de texto usan letra de 16 px o más (si no, Safari hace zoom). Usa el `inputmode` correcto (numérico para códigos y cantidades, decimal para precios, email para correos) y desactiva autocorrección donde estorba. El teclado no debe tapar el campo ni el botón de enviar.
- **Gestos y sistema:** sin zoom accidental por doble toque. Hojas que suben desde abajo, como en iOS. Modo oscuro según el iPhone.
- **Cámara, micrófono y voz:** cámara con `<input type="file" capture="environment">`; voz con el reconocimiento y la voz de Safari, con respaldo del dictado del teclado.
- **Instalación:** funciona abierta desde el ícono (sin barra de Safari) y también sin conexión con la última copia.
- **Textos:** en español sencillo, cortos, para leer en una pantalla pequeña.
- **Prueba:** cada entrega se prueba en un iPhone simulado (por ejemplo Playwright con `devices['iPhone SE']` y `devices['iPhone 13']`) y se revisa una captura.

## App nativa (Xcode)
- La app nativa vive en `ios/` (Capacitor 7 con Swift Package Manager, sin CocoaPods) y usa `web/` tal cual. Después de cambiar `web/`, correr `npx cap sync ios` y guardar en git la copia `ios/App/App/public`: el proyecto debe abrir en Xcode sin que Levi instale Node ni CocoaPods.
- Plugins nativos que no tengan `Package.swift` no se instalan por npm: su código Swift va en `ios/App/App/MainViewController.swift` (el mismo archivo que lo registra, para que Xcode siempre lo encuentre) con `CAPBridgedPlugin`. La voz ya funciona así.
- Todo cambio debe funcionar en los dos modos: app web en Safari y app nativa (`window.Capacitor.isNativePlatform()`). En nativo no hay service worker, la voz usa el plugin nativo y las llamadas a `/api` van a `CS_SERVIDOR`.
- La app usa el ciclo de vida con escenas (`SceneDelegate` en `AppDelegate.swift` y `UIApplicationSceneManifest` en `Info.plist`): el SDK de iOS 26 lo exige; si se regenera `ios/`, hay que conservarlo.
- Permisos nuevos de iPhone (cámara, ubicación, etc.) se declaran en `ios/App/App/Info.plist` con un texto en español.

## Versiones y entregas
- Cada entrega a Levi es una **versión nueva**: `1.x` cuando hay funciones nuevas y `1.x.y` cuando son solo correcciones. La versión 1.2 es la base de la app de Xcode.
- Al subir de versión se actualiza en todos lados: `package.json`, `MARKETING_VERSION` en `ios/App/App.xcodeproj/project.pbxproj` (y `CURRENT_PROJECT_VERSION` +1 si se publica en TestFlight), `VERSION` y `?v=` en `web/sw.js` y `web/index.html`, y el texto de versión en Ajustes (`web/js/plataforma.js`).
- Cada entrega incluye: el proyecto comprimido **`casita-stock-vX.Y.zip`**, listo para abrir en Xcode con `abrir-en-xcode.command`, y el **PDF de cambios `Casita-Stock-cambios-vX.Y.pdf`** (qué cambió, cómo probarlo, notas técnicas e historial). El texto fuente del historial está en `CAMBIOS.md`.

## Facturas e historial
- El escáner de facturas vive en `web/js/facturas.js` y usa las funciones de `app.js` y `asistente.js`. No cambia el inventario hasta que la persona toca Guardar.
- El historial de compras es la colección `compras` de la tabla `documentos`. Toda compra nueva que se registre por lotes debe guardar su compra con `guardarCompra` y pasar `cid` a `applyPurchase`.

## Otras reglas
- Principios de experiencia, arquitectura y datos: ver `README.md`.
- En cada publicación sube la versión en `web/sw.js` (`VERSION` y la lista `APP`) y los `?v=` de `web/index.html`.
- Antes de buscar información externa en internet, pedir permiso a Levi.
