# Reparo en la nube con Supabase (PC + celular con los mismos datos)

Con esto, la computadora del taller y tu celular ven **los mismos clientes, gastos,
inventario y datos del negocio**, automáticamente. Reparo sigue funcionando sin
internet: lo que hagas sin conexión se envía solo cuando vuelve.

Tus datos se guardan en **tu propio proyecto de Supabase** (plan gratis). Nadie más
puede verlos: cada cuenta sólo puede leer y escribir lo suyo.

> Si tu versión de Reparo ya viene con el proyecto configurado, salta a la
> **Parte 3**: sólo tendrás que crear tu cuenta con correo y contraseña.

---

## Parte 1 · Crear el proyecto en Supabase (una sola vez, ~10 minutos)

1. Entra a **https://supabase.com** y pulsa **Start your project**. Crea tu cuenta
   (puedes usar tu correo o tu cuenta de GitHub).
2. Pulsa **New project**:
   - **Name**: por ejemplo `reparo-mi-taller`.
   - **Database Password**: pulsa *Generate* y guárdala en un lugar seguro
     (Reparo no la necesita, pero Supabase te la puede pedir algún día).
   - **Region**: elige la más cercana a ti (p. ej. *South America (São Paulo)* o
     *East US* si estás en México).
   - Plan: **Free**. Pulsa **Create new project** y espera 1–2 minutos.
3. Prepara la base de datos:
   - En el menú de la izquierda abre **SQL Editor** → **New query**.
   - Abre el archivo `supabase/schema.sql` de Reparo, copia **todo** su contenido y
     pégalo en el editor.
   - Pulsa **Run** (o Ctrl + Enter). Debe decir *Success. No rows returned*.
   - Se puede ejecutar más de una vez sin problema.
   - **Para las fotos de evidencia:** pulsa otra vez **New query**, pega **todo** el
     archivo `supabase/storage.sql` y pulsa **Run**. Crea un espacio **privado**
     llamado `reparo-fotos` (máx. 10 MB por foto) donde cada cuenta sólo ve sus fotos.
     Si ya usabas la nube antes, basta con ejecutar este archivo: las fotos que ya
     tenías se suben solas en la siguiente sincronización.
4. Configura el inicio de sesión con correo:
   - Menú **Authentication** → **Sign In / Providers** → **Email**: debe estar
     activado.
   - **Opción simple (recomendada):** desactiva **Confirm email** y guarda. Así la
     cuenta queda lista al crearla, sin tener que abrir un correo.
   - **Si prefieres confirmar el correo:** déjalo activado y en
     **Authentication → URL Configuration** pon como **Site URL**
     `https://ikheb.github.io/reparabeta/` (y agrégala también en *Redirect URLs*).
     Los enlaces de confirmación y de "olvidé mi contraseña" llevarán ahí.
5. Copia los datos de conexión: **Project Settings** (engrane) → **API** /
   **Data API** y **API Keys**:
   - **Project URL** → se ve como `https://abcdefghijklmnopqrst.supabase.co`.
   - **Publishable key** (empieza con `sb_publishable_…`) o, en proyectos
     antiguos, la clave **anon public** (empieza con `eyJ…`).
   - ⚠️ **Nunca** uses la clave **secret** / **service_role**: Reparo la rechaza.
     La URL y la clave publishable/anon son públicas; la seguridad la dan las
     reglas (RLS) que creó `schema.sql`.

## Parte 2 · Conectar Reparo en la computadora

1. Abre Reparo → **Ajustes → Nube**.
2. Paso **Proyecto**: elige **URL y clave**, pega la *Project URL* y la clave.
   Pulsa **Probar conexión**: debe decir *¡Conexión correcta!*. Si dice que falta
   preparar la base de datos, repite el paso 3 de la Parte 1.
3. Pulsa **Guardar y continuar**.

## Parte 3 · Crear tu cuenta (en la computadora)

1. En **Ajustes → Nube**, paso **Cuenta**, elige **Crear cuenta**.
2. Escribe tu correo y una contraseña (mínimo 8 caracteres) y pulsa **Crear cuenta**.
   - Si dejaste activado *Confirm email*, abre el enlace que te llega (revisa
     *Spam*) y luego vuelve y usa **Iniciar sesión**.
3. Listo: Reparo sube todos tus datos. Verás **Al día** y la fecha y hora de la
   última sincronización.

## Parte 4 · Conectar el celular

1. En la computadora, en **Ajustes → Nube → Conectar otro dispositivo**, pulsa
   **Mostrar código**. Verás un **código de conexión** (texto que empieza con
   `REPARO1.`) y un **QR**.
2. Pásalo al celular: pulsa **Copiar código** y envíatelo (WhatsApp a ti mismo,
   correo…) o escanea el QR con la cámara del celular y copia el texto.
   El código **no** incluye tu contraseña.
3. En el celular abre Reparo:
   - **Primera vez:** en la bienvenida elige *¿Ya usas Reparo en otro dispositivo?*
     → **Código de conexión** → pega el código → escribe **el mismo correo y
     contraseña** → **Traer mis datos**.
   - **Si ya lo usabas:** Ajustes → Nube → Código de conexión → pegar →
     **Iniciar sesión**.
4. Listo. Desde ahora ambos dispositivos se sincronizan solos.

> Con la versión que ya trae el proyecto configurado no hay código: en el celular
> sólo inicia sesión con el mismo correo y contraseña.

---

## ¿Cuándo se sincroniza?

- Al abrir la app y al volver a ella.
- Al volver el internet.
- Cada minuto mientras la app está abierta.
- Unos 2 segundos después de cada cambio.
- Cuando pulsas **Sincronizar ahora** en Ajustes → Nube.

## ¿Qué se sincroniza y qué no?

| Se sincroniza | Se queda en cada dispositivo |
|---|---|
| Clientes / servicios (incluida la papelera) | Notificaciones |
| Gastos | Tema (oscuro/claro) y preferencias de avisos |
| Inventario y sus movimientos | Configuración del servidor local opcional |
| Registro de actividad | |
| Datos del negocio: nombre, dueño, teléfono, dirección, pie del recibo, código de país, moneda, formato regional, inicio de semana, meta mensual | |
| **Fotos de evidencia** (y su descripción); al borrar una foto se borra en todos lados | |

### Fotos

- Cada foto se sube con su miniatura. En el otro dispositivo primero aparecen las
  miniaturas y después se descargan las fotos completas (3 a la vez).
- En **Ajustes → Nube** verás el avance ("Subiendo fotos 3/10").
- Si una foto no se puede subir (sin internet, o falta `storage.sql`), tus datos se
  sincronizan igual y la foto se reintenta sola la próxima vez.
- El plan gratis de Supabase incluye 1 GB de almacenamiento (miles de fotos
  comprimidas de ~200–400 KB).

Si un mismo registro se cambia en los dos dispositivos, **gana el cambio más
reciente**. Por eso conviene que la fecha y hora de ambos equipos estén correctas
(automáticas).

## Problemas frecuentes

- **"Correo o contraseña incorrectos"**: revisa mayúsculas y que sea el mismo correo
  que usaste al crear la cuenta. Usa *¿Olvidaste tu contraseña?* para crear una nueva.
- **"Tu correo aún no está confirmado"**: abre el enlace del correo (revisa *Spam*) o
  desactiva *Confirm email* (Parte 1, paso 4).
- **"Falta preparar la base de datos"**: ejecuta `supabase/schema.sql` en el SQL Editor.
- **"Falta preparar el espacio de fotos"**: ejecuta `supabase/storage.sql` en el SQL Editor.
- **"Supabase tuvo un problema (5xx)"**: los proyectos gratis se **pausan tras ~7 días
  sin uso**. Entra a supabase.com y pulsa *Restore project*.
- **Sin internet**: no pasa nada; sigue trabajando y se enviará al volver.
- **Folios repetidos**: si registras servicios nuevos en los dos dispositivos al mismo
  tiempo sin conexión, ambos pueden tomar el mismo número de folio. Al sincronizar no se
  pierde ningún registro; sólo verás dos servicios con el mismo folio.

## Para desarrolladores: proyecto predeterminado en el build

Si defines estas variables al compilar (p. ej. en `.env.production` o en el workflow de
GitHub Pages), la app usa ese proyecto por defecto y **oculta** los pasos de URL, clave y
código de conexión (sólo pide correo y contraseña). La config que ingrese el usuario en
Ajustes, si existe, tiene prioridad.

```
VITE_REPARO_CLOUD_URL=https://<ref>.supabase.co
VITE_REPARO_CLOUD_KEY=sb_publishable_…
```

Detalles técnicos: tabla genérica `public.reparo_rows` (una fila JSON por registro,
`seq` asignado por trigger), RPC `public.reparo_push(rows jsonb)` con LWW por
`updated_at` (append-only para `movements` y `audit`), descarga por `seq > cursor`
paginada de 1000 en 1000 con un margen de 200 para no perder transacciones lentas.
Los cambios remotos se aplican sin generar auditoría nueva. Fotos: fila `tbl='photos'`
(metadatos, sin blobs, LWW) + archivos en el bucket privado `reparo-fotos`
(`<userId>/<photoId>.jpg` y `<userId>/<photoId>_t.jpg`; `.webp`/`.png` según el tipo).
Los borrados viajan como lápidas (`deletedAt`). Código en `src/cloud/`.
