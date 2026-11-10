# Casita Stock

Inventario del hogar: evitar compras repetidas, saber qué falta, qué vence y cuánto se gasta, con códigos de barras, fotos e IA, y un asistente de voz con nombre propio.

**Para instalarla en el iPhone, sigue [GUIA-INSTALACION.md](GUIA-INSTALACION.md).** Para probarla en el simulador o compilarla en Xcode como app nativa, sigue [GUIA-XCODE-IPHONE.md](GUIA-XCODE-IPHONE.md).

**Versión actual: 1.3.2.** Para abrirla en Xcode solo necesitas Xcode: doble clic en `abrir-en-xcode.command` (o abre `ios/App/App.xcodeproj`). Los cambios de cada versión están en `CAMBIOS.md` y en PDF en `docs/cambios/` (se generan con `python3 herramientas/pdf_cambios.py 1.3`).

**Regla del proyecto: todo se diseña y se prueba para iPhone.** La lista de verificación está en [CLAUDE.md](CLAUDE.md).

## Estructura del repositorio
- `web/` — la app instalable (PWA): `index.html`, `css/`, `js/` (`voz.js`, `plataforma.js`, `app.js`, `asistente.js`, `facturas.js`), `manifest.webmanifest`, `sw.js`, `icons/`, y funciones de servidor en `web/api/` (`ia.js` = puente seguro con la IA, `config.js` = configuración pública). En Vercel, Root Directory = `web`.
- `ios/`, `package.json`, `capacitor.config.json` — app nativa de iPhone (Capacitor 7 con Swift Package Manager) que envuelve `web/`; trae la copia de la app en `ios/App/App/public` y se abre en Xcode sin CocoaPods. Voz con el reconocimiento nativo (`ios/App/App/MainViewController.swift`); IA y configuración desde el servidor de Vercel indicado en `web/js/config-nativo.js`.
- `supabase/schema.sql` — base de datos: hogares, miembros, documentos (productos, lista, ajustes), reglas de acceso por casa, tiempo real.
- `app/` — versión anterior que vivía dentro de Claude (referencia).
- `datos/` — plantilla del modelo. El archivo `importar.json` con datos reales no se sube al repositorio.

## Unidades por paquete (versión 1.1)
- El inventario cuenta **unidades sueltas** (por ejemplo huevos). Cada producto guarda `porPaquete`, `empaque` (Suelto, Paquete, Cartón, Caja, Bolsa, Botella, Lata), `unidad` (nombre en singular, ej. "huevo") y `paquetes` = `{ código: unidades }`, para que cartones de 6, 12 o 30 con códigos distintos sumen al mismo producto.
- Al registrar: "¿Cómo viene?" y "¿Cuántas unidades trae?" se preguntan una sola vez por código. Luego se compra por paquetes ("2 cartones = 24 huevos") y el precio se escribe por paquete; se guarda también el precio por unidad.
- Un código nuevo puede asignarse a un producto existente ("¿Es otro tamaño de algo que ya tienes?").
- "Usé 1" descuenta una unidad. El inventario muestra "53 huevos · 4 cartones y 5 huevos". El aviso de compra es en unidades; la lista sugiere comprar en paquetes.
- Historial: cada compra guarda `n` (unidades), `pq` (paquetes) y `pp` (unidades por paquete).
- Asistente: entiende "2 cartones", "una docena"; la herramienta `proponer_cambios` acepta `paquetes` y la app multiplica.

## Escáner de facturas (versión 1.3)
- Entrada: botón "Escanear factura" en Agregar (y en Compras y en el Historial). Cámara, fotos de la galería o PDF; varias páginas por factura.
- Las fotos largas se cortan en tramos de hasta 1568 px (con 6 % de traslape) para que la IA lea la letra pequeña; si pesan más de 4 MB se vuelven a comprimir. PDF de hasta 3 MB.
- Lectura: `sample.json` con `files` (imágenes + PDF como "document"), modelo estándar y hasta 8000 tokens de respuesta, por `/api/ia` (la llave sigue solo en Vercel; `maxDuration` 60 s en `vercel.json`). Se puede detener y volver a intentar.
- La IA devuelve tienda, fecha, subtotal, impuestos, descuentos, total e items (línea original, nombre, marca, tamaño, categoría, cantidad, precio unitario, total, descuento, código, `productoId` sugerido, confianza y duda).
- Comparación con el inventario, en este orden: lo aprendido de facturas anteriores (`aliasFactura`), código de barras, `productoId` de la IA, nombre igual. Estados: **ya existe** (se suma), **nuevo** (se crea) y **por revisar** (dudas, precio ilegible, confianza baja o coincidencia no segura). Las líneas repetidas del mismo producto se unen.
- Revisión: cambiar a qué producto corresponde, nombre, tipo, unidades por paquete, cantidad y precio; quitar líneas; "Está bien así" en cada producto por revisar. Compara la suma con el subtotal de la factura y avisa si una factura igual (tienda, fecha y total) ya se guardó. **Nada cambia hasta "Guardar".**
- Guardar: cada producto se escribe una sola vez (`applyPurchase` con paquetes, precio real por unidad después de descuento y `cid` de la compra); los nuevos se crean una vez aunque salgan varias veces; lo comprado sale de la lista. Si falla la conexión, al reintentar no se repite lo ya guardado.
- Historial: colección `compras` en la misma tabla `documentos` (sin tablas nuevas, mismas reglas de acceso y tiempo real). `compras/{id}`: `{ fecha, tienda, origen: factura | lote | lista, items[{ productoId, nombre, linea, cantidad, unidades, precioUnitario, descuento, total }], subtotal, impuestos, descuentos, total, paginas, creado, u }`. La compra grande y "Terminé de comprar" también guardan su compra.
- Gastos (Historial): por semana (8), por mes (6), por supermercado, lo que más compras, cambios de precio y dónde sale más barato (precio por unidad). Suma las compras guardadas (con impuestos) y las compras sueltas del historial de cada producto que no tienen compra asociada, para no contar dos veces.

## Arquitectura de la versión instalable
- `plataforma.js` ofrece `window.claude.use(nombre)` con la misma forma que usaba la versión dentro de Claude (`db`, `user`, `sample`, `downloads`), implementado con Supabase y `/api/ia`. Así `app.js` casi no cambió.
- Datos: tabla `documentos (hogar_id, coleccion, id, data jsonb)`; cada casa solo ve lo suyo (Row Level Security). Tiempo real por canal de Supabase; al volver a la app se recarga para no perder cambios.
- Cuentas: correo + código (OTP), sin contraseña; familia por código de invitación.
- IA: el teléfono llama a `/api/ia` con su sesión; el servidor verifica la sesión y llama a la API de Anthropic con la llave guardada en Vercel. Herramientas del asistente (buscar, listar, ver producto, proponer cambios, pedir producto nuevo) se ejecutan en el teléfono contra la base de datos en vivo.
- Voz: reconocimiento de voz del navegador (Safari) para escuchar, voz del teléfono para responder; respaldo con el dictado del teclado.
- Sin conexión: el service worker guarda la app; los datos muestran la última copia.

## Principios de experiencia (aplican a todo el proyecto)
- Una pantalla, una pregunta: el título de cada paso es la pregunta en lenguaje cotidiano ("¿Cuántos compraste?").
- "Paso X de 5" siempre visible, con una frase corta de ayuda.
- Botones grandes (mínimo 44–58 px) y un solo botón principal por pantalla, abajo, al alcance del pulgar.
- Elegir en lugar de escribir: opciones tocables (tipo, ubicación, fecha, vencimiento, aviso).
- Estados con color + ícono + palabra: "Hay suficiente", "Queda poco", "Se acabó", "Vence en 3 días". Nunca solo color.
- Resumen en una frase antes de guardar y pantalla de éxito con el siguiente paso obvio.
- Toda acción rápida se puede deshacer (Usé 1, borrar, quitar de la lista).
- Mensajes de error que dicen qué pasó y qué hacer, sin términos técnicos.
- Funciona en modo claro y oscuro, y en celular.

## Pestañas
1. **Agregar**
   - Un producto: Escanear → Datos → Cantidad (precio y tienda opcionales) → Detalles (vencimiento y aviso) → Confirmar.
   - Compra grande: escanear varios seguidos y revisar todo junto al final (cantidad y precio por producto, una sola tienda y fecha).
   - Sin código: foto y la IA lee la etiqueta (nombre, marca, tamaño, tipo, código y fecha de vencimiento si se ve).
2. **Inventario**: buscador, filtros "Úsalo pronto / Por comprar / Todo", filtro por lugar de la casa, "Te alcanza para X días", botón "Usé 1" con Deshacer, descarga a Excel (CSV).
   - Ficha (tocar la foto): descripción con IA, cantidad, mínimo sugerido según consumo, último precio y tienda más barata, movimientos con quién compró o usó, editar datos, pasar a la lista, borrar.
3. **Compras**: lista con casillas. Se llena sola con lo que se acaba; también se agregan cosas a mano. "Terminé de comprar" abre la revisión (cantidades, precios, tienda) y suma todo al inventario.
4. **Asistente**: análisis con IA (comprar pronto con cantidades, úsalo pronto, alertas, mejoras; botón "Pasar todo a mi lista"), chat con preguntas libres, gastos del mes por tipo, productos que subieron de precio, uso en familia.

## Voz
La versión dentro de Claude no tiene voz (se probaron dos versiones y se retiraron). La versión instalable (`web/`) incluye el asistente de voz con nombre propio, basado en el diseño de la versión 7:
- Versión 6, "Dilo con tu voz": cuadro en Agregar usando el dictado del teclado; la IA interpretaba compras, usos y productos nuevos contra el inventario, con pantalla de confirmación, alias aprendidos, marca "Faltan datos" y modo básico sin IA.
- Versión 7, asistente unificado: botón de micrófono en todas las pantallas; la IA consultaba la base de datos en vivo con funciones y proponía cambios en tarjetas que la persona confirmaba; pedía código o foto para productos nuevos; opción de leer respuestas en voz alta.
- Limitación técnica a recordar: dentro de Claude la página no tiene acceso directo al micrófono; en la web hay que usar el dictado del teclado. Un botón de voz propio requiere la app nativa.

## Cálculos (sin IA, sin costo)
- Consumo diario = unidades usadas en los últimos 60 días ÷ días del periodo (mínimo 7).
- Te alcanza = en casa ÷ consumo diario. Si es menos de 3 días, el producto pasa a "Queda poco".
- Mínimo sugerido = consumo de 5 días. Cantidad a comprar = lo que cubre 14 días (o lo que falta para superar el mínimo).
- Vencimiento: al comprar más se conserva la fecha más cercana; al acabarse se borra.

## Detección de repetidos
1. Por código de barras (exacto). 2. Sin código: por nombre + marca.

## Datos (base de datos de la página, compartida con quien tenga acceso)
- `productos/{id}`: `{ codigo, nombre, marca, categoria, ubicacion, tamano, cantidad, minimo, fechaCompra, vence, precio, tienda, foto, descripcionIA, historial[] }`
  - `historial`: últimos 40 movimientos `{ t: "c" compra | "u" uso | "a" ajuste, n, f: fecha, p?: precio unitario, s?: tienda, u?: id de quien lo hizo }`
- `lista/{id}`: `{ productoId | "", nombre, cantidad, marcado, creado, u }` (los ligados a un producto usan id `p_<productoId>`)
- `compras/{id}`: historial de compras (ver Escáner de facturas). Los movimientos de compra llevan `cid` con la compra a la que pertenecen y los productos guardan `aliasFactura` (cómo salen en las facturas).
- `ajustes/analisis`: último análisis de la IA (se ve en todos los dispositivos)
- Copia local del último estado para mostrar algo si no hay conexión.
- Fuera de Claude la app guarda en el navegador.

## IA
- Usa la cuenta de Claude de quien abre la página; la primera vez pide permiso.
- Lectura de etiqueta (rápida), descripción del producto (rápida, se guarda), clasificación de productos nuevos en compra grande (una sola consulta), análisis completo (modelo estándar), chat (rápido).

## Hoja de ruta: versión nativa
Lo que el prototipo web no puede hacer y requiere app móvil:
- Escaneo en vivo con la cámara (sin tomar foto).
- Funcionar completamente sin conexión, con sincronización al volver la señal.
- Base de productos por código (por ejemplo Open Food Facts) para llenar datos automáticamente.
- Notificaciones: "se está acabando", "vence mañana", resumen antes del día de compras.
- Fotos en almacenamiento aparte y backend propio con cuentas de familia.
Stack sugerido: React Native (Expo) o Flutter, base local SQLite con sincronización, backend tipo Supabase/Firebase.

## Propuestas pendientes (en espera, sin implementar)
- Tienda como dato principal: preguntar "¿Dónde estás comprando?" al iniciar una compra, recordar la tienda habitual y la más barata de cada producto, agrupar la lista de compras por tienda y comparar precios entre tiendas en el asistente.
- Compartir la lista con la familia: lista en vivo para quienes tengan cuenta de Claude, con "Lo compro yo" para no duplicar compras, y botón "Enviar lista" (texto por tienda para WhatsApp) para quienes no tengan cuenta.
