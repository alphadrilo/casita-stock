# Casita Stock: guía de instalación en tu iPhone

Esta guía te lleva desde cero hasta tener Casita Stock instalada en tu iPhone, con tu familia y con el asistente de voz. Toma entre 30 y 45 minutos la primera vez. Después, cada mejora se publica sola.

## Qué vas a tener

- **La app en la pantalla de inicio del iPhone**, que se abre a pantalla completa como cualquier otra.
- **Tu inventario en la nube (Supabase)**: lo ves desde cualquier teléfono de la casa y se actualiza al instante.
- **Un asistente de voz con el nombre que elijas** al instalarla. Le hablas, te contesta en voz alta, revisa el inventario antes de responder y guarda solo cuando le dices "sí".
- **Tu familia** se une a la misma casa con un código.

## Lo que necesitas

| Servicio | Para qué | Costo |
|---|---|---|
| **Supabase** (supabase.com) | Base de datos, cuentas y familia | Plan gratuito |
| **Anthropic** (console.anthropic.com) | La inteligencia artificial del asistente | Pago por uso; pones un límite de gasto mensual |
| **GitHub** (github.com) | Guardar el código | Gratis |
| **Vercel** (vercel.com) | Publicar la app en internet | Plan gratuito (Hobby) |

Te conviene hacer los pasos 1 a 4 en la computadora y el paso 5 en el iPhone.

---

## Paso 1: Supabase (base de datos y cuentas)

1. Entra a **supabase.com**, crea una cuenta y toca **New project**.
   - Nombre: `casita-stock`.
   - Database password: genera una y guárdala en un lugar seguro. La app no la necesita.
   - Region: la más cercana, por ejemplo *East US*.
2. Cuando el proyecto esté listo, ve a **SQL Editor** → **New query**. Pega **todo** el contenido del archivo `supabase/schema.sql` y toca **Run**. Debe decir *Success*.
3. Ve a **Authentication** → **Sign In / Providers** → **Email**. Deja **Enable Email provider** encendido y **apaga "Confirm email"**. Toca **Save**.
   La app entra con **correo y contraseña** y no envía correos: así funciona con el plan gratis de Supabase, que solo manda correos a tu propia cuenta si no configuras un servidor de correo (SMTP).
4. Revisa también que **"Allow new users to sign up"** esté encendido, para que tu familia pueda crear su cuenta.
5. Ve a **Project Settings** → **API** (o *Data API*) y copia en una nota estos dos valores:
   - **Project URL**, por ejemplo `https://abcdxyz.supabase.co`.
   - **anon public key**, un texto largo que empieza con `eyJ…`.

> Si alguien olvida su contraseña: en Supabase → **Authentication → Users**, toca a la persona → **Reset password** necesita correo (SMTP); sin SMTP, bórrala y que cree su cuenta otra vez con el mismo correo (su casa sigue igual al unirse con el código).

## Paso 2: Anthropic (la IA del asistente)

1. Entra a **console.anthropic.com** y crea una cuenta.
2. En **Billing**, agrega un método de pago y créditos, y pon un **límite de gasto mensual** que te deje tranquilo.
3. En **API Keys** toca **Create Key** y nómbrala `casita-stock`. Copia la llave (empieza con `sk-ant-…`). Solo se muestra una vez.

> Esta llave nunca llega al teléfono: vive en Vercel, y la app le pide a tu servidor que hable con la IA solo si la persona inició sesión.

## Paso 3: GitHub (guardar el código)

1. Entra a **github.com**, crea una cuenta si no tienes, y luego **New repository**.
   - Nombre: `casita-stock`.
   - Visibilidad: **Private**.
   - No marques ninguna opción de crear archivos.
2. Sube el código. Tienes dos opciones:
   - **Que lo suba yo**: dime el nombre del repositorio (por ejemplo `tu-usuario/casita-stock`) y lo subo desde aquí.
   - **Subirlo tú**: descomprime `casita-stock.zip`, entra al repositorio vacío, toca **uploading an existing file** y arrastra **todo el contenido** de la carpeta. Luego toca **Commit changes**.

## Paso 4: Vercel (publicar la app)

1. Entra a **vercel.com** → **Sign Up** → **Continue with GitHub**.
2. Toca **Add New…** → **Project** y elige el repositorio `casita-stock` (**Import**).
3. Antes de publicar:
   - **Root Directory**: toca *Edit* y elige la carpeta **`web`**. Este paso es importante.
   - **Framework Preset**: *Other*.
   - **Environment Variables**: agrega estas tres:

     | Name | Value |
     |---|---|
     | `SUPABASE_URL` | la Project URL del paso 1 |
     | `SUPABASE_ANON_KEY` | la anon public key del paso 1 |
     | `ANTHROPIC_API_KEY` | la llave del paso 2 |
4. Toca **Deploy**. En uno o dos minutos te da una dirección como `https://casita-stock-web-ukbp.vercel.app`.
5. Ábrela en la computadora para revisar que cargue. Debe pedirte tu correo. Si dice **"Modo demo"**, revisa las variables del paso 3 y vuelve a publicar (*Deployments* → *⋯* → *Redeploy*).
6. Opcional: en Supabase → **Authentication** → **URL Configuration**, pon esa dirección en **Site URL**.

## Paso 5: Instalarla en tu iPhone

1. Abre la dirección de Vercel en **Safari**. Tiene que ser Safari.
2. Toca el botón **Compartir** (el cuadro con la flecha hacia arriba) y luego **"Añadir a pantalla de inicio"** → **Añadir**.
3. **Abre Casita Stock desde el ícono nuevo** y haz todo lo demás ahí. La app instalada guarda su propia sesión, separada de Safari.
4. Toca **Crear cuenta** con tu correo y una contraseña de al menos 8 letras o números. Las siguientes veces usa **Ya tengo cuenta: entrar**.
5. Escribe tu nombre y toca **Crear mi casa**.
6. **Ponle nombre a tu asistente**, elige su voz y toca "Escuchar cómo suena". Cada teléfono puede tener su propio nombre de asistente, y se cambia cuando quieras en Ajustes.
7. Toca el botón morado con el nombre del asistente y **permite el micrófono** cuando el iPhone lo pida.

## Paso 6: Traer tus productos de la versión anterior

Te entrego el archivo `importar.json` con lo que tenías en la versión dentro de Claude: 3 productos tuyos, más los de ejemplo.

1. Pásalo al iPhone por AirDrop o guárdalo en la app **Archivos**. También puedes hacerlo desde la computadora, abriendo la dirección de Vercel e iniciando sesión.
2. En Casita Stock toca el **engranaje** → **Importar una copia (.json)** y elige el archivo.
3. Para quitar los de ejemplo: **Inventario** → **Borrar los productos de ejemplo**.

## Paso 7: Tu familia

1. En **Ajustes** → **Compartir código**, envíales el mensaje por WhatsApp o mensajes.
2. Cada persona instala la app (paso 5), crea su cuenta con **su propio correo y contraseña**, escribe su nombre y elige **Unirme con el código**.
3. Todos ven el mismo inventario y la misma lista al instante. En cada producto se ve quién compró o usó.
4. Si el código se compartió con alguien que no debía, usa **Cambiar código** en Ajustes. Quienes ya están dentro siguen en la casa.

## Paso 8 (opcional): Llamar al asistente con Siri

1. Abre la app **Atajos** → **+** → **Añadir acción** → busca **Abrir URL**.
2. Escribe: `https://TU-DIRECCION.vercel.app/?hablar=1`.
3. Ponle al atajo **el nombre de tu asistente**, por ejemplo "Casi".
4. Ahora puedes decir **"Oye Siri, Casi"** y se abre Casita Stock con el asistente listo. Si no empieza a escuchar solo, toca el micrófono.

---

## Cómo usar el asistente

- Toca el botón morado con su nombre, o "Díselo a…" en Agregar.
- **Habla con naturalidad:**
  - *"¿Cuánta leche queda?"*
  - *"Compré 3 leches en el Central a 1.35"*
  - *"Se acabó el detergente"*
  - *"Hay 5 huevos"* (corrige la cantidad exacta)
  - *"¿Qué vence esta semana?"* o *"¿Qué me falta comprar?"*
- **Para guardar**, di **"sí"** o toca *Guardar*. Para cancelar, di **"no"**.
- **Producto nuevo:** te pide escanear el código o tomarle una foto. Para frutas, verduras o pan, di *"no tiene código"*.
- **Conversación continua:** después de responder vuelve a escucharte. Di **"gracias"** para terminar. Se puede apagar en Ajustes.
- Aprende cómo llamas a tus productos: si dices "lechitas" y confirmas, la próxima vez lo reconoce directo.

## Productos que vienen en paquete (huevos, latas, rollos…)

- La primera vez que registras un cartón, elige **"¿Cómo viene?" → Cartón**, toca cuántas unidades trae (por ejemplo **12**) y escribe cómo se llama cada una (**huevo**).
- Desde ahí, cada compra se cuenta por cartones: "2 cartones = 24 huevos". El precio lo escribes por cartón y la app calcula cuánto cuesta cada huevo.
- Si compras otro tamaño, por ejemplo un cartón de 30 con otro código, al escanearlo elige **"¿Es otro tamaño de algo que ya tienes?" → Huevos**. Todo suma al mismo producto.
- **"Usé 1"** descuenta un huevo. En el inventario ves "53 huevos · 4 cartones y 5 huevos".
- Al asistente le puedes decir *"compré 2 cartones de huevos"* o *"una docena de limones"*.

## Actualizar a una versión nueva

Cuando recibas una versión nueva (por ejemplo la 1.3 con el escáner de facturas), sube el código a GitHub y Vercel la publica sola. La 1.3 necesita esa publicación: le da a la IA hasta 60 segundos para leer facturas largas.

## Si algo no funciona

| Problema | Qué hacer |
|---|---|
| "Esta cuenta espera confirmación por correo" | En Supabase → Authentication → Sign In / Providers → Email, apaga **Confirm email** y guarda. |
| "Correo o contraseña incorrectos" | Revisa mayúsculas y el correo. Si la olvidaste, mira la nota del paso 1. |
| Dice "Modo demo" | Faltan o están mal las variables de Vercel (paso 4.3). Corrígelas y vuelve a publicar. |
| "El micrófono está bloqueado" | En el iPhone: **Ajustes → Safari → Micrófono → Preguntar** o **Permitir**, y vuelve a abrir la app. |
| "El reconocimiento de voz está apagado" | **Ajustes → Siri** (o *General → Teclado*) → activa **Dictado**. |
| El asistente no me escucha en la app instalada | Puede pasar en algunas versiones de iOS. Mientras tanto, toca el cuadro de texto y usa el micrófono del teclado: funciona igual. Avísame qué versión de iOS tienes. |
| "No se pudo terminar la lectura" al escanear una factura | Revisa la conexión y toca "Intentar otra vez". Si la factura es muy larga, léela en dos partes. Revisa que Vercel tenga la versión 1.3. |
| "La IA no está configurada" | Revisa `ANTHROPIC_API_KEY` en Vercel y que tengas créditos en Anthropic. |
| No veo los cambios de mi familia | Cierra y abre la app. Se actualiza sola al volver a ella. |
| Publiqué una mejora y no aparece | Cierra la app por completo y ábrela de nuevo; a veces hay que hacerlo dos veces. |

## Para quien mantiene el código

- `web/`: la app (HTML, CSS y JavaScript sin compilación), el *service worker* y las funciones de servidor en `web/api/` (`ia.js` y `config.js`).
- `supabase/schema.sql`: tablas, reglas de acceso por casa y funciones `crear_hogar`, `unirse_hogar` y `nuevo_codigo`.
- **Para publicar una versión nueva**, sube el número de versión en tres lugares para que los teléfonos descarguen los archivos nuevos: `VERSION` en `web/sw.js`, `?v=` en `web/index.html` y la lista `APP` de `web/sw.js`.
- **Modelos de IA:** el modelo rápido es `claude-haiku-5-5` y el estándar `claude-sonnet-5-5`. Se pueden cambiar con las variables `MODELO_RAPIDO` y `MODELO_ESTANDAR` en Vercel.
- **Prueba local:** `npx vercel dev` dentro de `web/`, o abre `web/` con cualquier servidor estático, que arranca en modo demo.
