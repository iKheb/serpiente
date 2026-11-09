# Reparo · servidor opcional

Reparo funciona **100 % sin internet** en cada dispositivo: los datos viven en el navegador
(IndexedDB). Este servidor es **opcional** y sirve para tres cosas:

1. **Servir la app** en la red local del taller (sin internet): la abres desde la PC del
   mostrador y desde el celular del técnico conectados a la misma WiFi.
2. **Sincronizar** varios dispositivos: clientes, gastos, inventario, movimientos y el
   registro de actividad llegan a todos. Cada dispositivo sigue funcionando sin conexión y
   se pone al día cuando vuelve a ver al servidor.
3. **Enviar notificaciones push reales** (Web Push), aunque la app esté cerrada:
   stock bajo, equipo listo para entregar y resumen diario.

No tiene dependencias: sólo Node.js **22 o superior** (usa `node:http`, `node:sqlite`,
`node:crypto`). No hace falta `npm install` para el servidor.

---

## Inicio rápido

```bash
npm run build      # compila la app (genera ../app/index.html, sw.js, manifest, íconos)
npm run server     # inicia el servidor en http://0.0.0.0:8787
```

Al iniciar verás algo así:

```
  Reparo · servidor v1.0.0

  Local:       http://localhost:8787
  Red local:   http://192.168.1.23:8787  (wlan0)
               Ábrela desde el celular conectado a la misma WiFi del taller.
```

Luego, en **cada dispositivo**: abre la app → **Ajustes → Sincronización** → escribe la
dirección del servidor (p. ej. `http://192.168.1.23:8787`), pulsa **Probar conexión** y activa
la sincronización. Si abriste la app desde el propio servidor, esa misma dirección es la del servidor.

> Para probar todo sin navegador: `node server/tools/simular-dispositivos.mjs` arranca un
> servidor temporal, simula dos dispositivos y comprueba que todo converge.

---

## En la red local del taller

- La PC que corre el servidor debe estar encendida y en la misma red que los celulares.
- Da a esa PC una **IP fija** en el router (reserva DHCP) para que la dirección no cambie.
- Si el celular no conecta, revisa el **firewall** de la PC (permite el puerto 8787) y que la
  WiFi no tenga "aislamiento de clientes" (común en redes de invitados).
- **Protege el acceso con un token** (muy recomendado): los registros de clientes incluyen el
  PIN, contraseña o patrón de desbloqueo de los equipos.

  ```bash
  REPARO_TOKEN="$(openssl rand -hex 24)" npm run server
  ```

  En la app usa la dirección con el token al final:
  `http://192.168.1.23:8787/?token=EL_TOKEN`. Sin token, el servidor muestra un aviso al iniciar.

### HTTPS: necesario para el modo instalable y las notificaciones en otros dispositivos

Los navegadores sólo permiten **service worker** (app instalable y sin conexión) y **Web Push**
en `https://` o en `localhost`. Desde el celular (`http://192.168.x.x`) la app funciona y
sincroniza, pero **no** se puede instalar ni recibir push. Opciones:

**a) Certificado local con [mkcert](https://github.com/FiloSottile/mkcert)** (sin internet):

```bash
mkcert -install                                   # crea una autoridad local de confianza
mkcert 192.168.1.23 reparo.local localhost        # genera el certificado
REPARO_TLS_CERT=./192.168.1.23+2.pem REPARO_TLS_KEY=./192.168.1.23+2-key.pem npm run server
```

Instala la autoridad de mkcert en cada celular (`mkcert -CAROOT` muestra dónde está
`rootCA.pem`; en Android: Ajustes → Seguridad → Instalar certificado; en iPhone: envíalo,
instálalo y actívalo en Ajustes → General → Información → Confianza de certificados).
Luego abre `https://192.168.1.23:8787`.

**b) Un túnel con HTTPS** (requiere internet): p. ej. `cloudflared tunnel --url http://localhost:8787`
o `tailscale serve 8787`. Con un túnel **usa siempre `REPARO_TOKEN`**. Si no usas token,
agrega el nombre del túnel a `REPARO_HOSTS` (protección contra *DNS rebinding*).

> Las notificaciones push salen del servidor hacia los servicios push de Google, Mozilla o
> Apple, así que **el envío de push sí necesita internet** en el servidor. La sincronización y
> la app no.

---

## Variables de entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `PORT` / `REPARO_PORT` | `8787` | Puerto. `0` = uno libre. |
| `REPARO_HOST` | `0.0.0.0` | Interfaz. `127.0.0.1` = sólo este equipo. |
| `REPARO_TOKEN` | — | Token de acceso a la API (`Authorization: Bearer …`). Muy recomendado. |
| `REPARO_TLS_CERT`, `REPARO_TLS_KEY` | — | Activan HTTPS (rutas a los archivos PEM). |
| `REPARO_APP_DIR` | `../app` (salida de `vite build`) | Carpeta de la app compilada. |
| `REPARO_DATA_DIR` | `server/data` | Base SQLite (`reparo.db`) y llaves VAPID (`vapid.json`). |
| `REPARO_CORS` | mismo origen + localhost | Orígenes extra separados por comas; `lan` = IPs privadas; `null` = app abierta desde archivo; `*` = todos. |
| `REPARO_HOSTS` | — | Nombres de host extra aceptados sin token (dominios, túneles). |
| `REPARO_MAX_BODY_MB` | `25` | Tamaño máximo de cada solicitud. |
| `REPARO_VAPID_SUBJECT` | `mailto:reparo@example.com` | Contacto para los servicios push (`mailto:` o `https:`). Pon tu correo. |
| `REPARO_DAILY_HOUR` | — (desactivado) | Hora local (0–23) del resumen diario por push. |
| `REPARO_CURRENCY`, `REPARO_LOCALE` | `MXN`, `es-MX` | Formato de montos del resumen diario. |
| `TZ` | la del sistema | Zona horaria para el "día" del resumen (p. ej. `America/Mexico_City`). |
| `REPARO_CSP_CONNECT` | — | Orígenes extra permitidos en `connect-src` de la CSP. |
| `REPARO_HSTS` | — | `1` envía `Strict-Transport-Security` (sólo con HTTPS). |
| `REPARO_LOG` | `info` | `debug`, `info` o `quiet`. |

---

## API

Todas las respuestas son JSON; los errores tienen la forma `{ "ok": false, "error": "mensaje en español", "code": "…" }`.
Con `REPARO_TOKEN`, todo exige `Authorization: Bearer <token>` salvo `health` y la llave pública.

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/health` | — | `{ ok, version, time, service, authRequired }` |
| `GET /api/sync/status` | — | `{ serverId, cursor, rows, devices, pushSubscriptions }` |
| `POST /api/sync` | `{ deviceId, cursor, changes: { clients, expenses, inventory, movements, audit } }` | `{ serverId, cursor, more, changes, accepted, unchanged, rejected, serverTime, resync? }` |
| `GET /api/push/vapid-public-key` | — | `{ key }` (punto P-256 sin comprimir, 65 bytes, base64url) |
| `POST /api/push/subscribe` | `{ deviceId, subscription }` (`PushSubscription.toJSON()`) | `{ ok }` |
| `POST /api/push/unsubscribe` | `{ endpoint }` | `{ ok, removed }` |
| `POST /api/push/test` | `{ deviceId }` | `{ ok, sent, failed, removed }` (404 si no hay suscripción) |

### Cómo funciona la sincronización

- Cada fila se guarda en SQLite (modo WAL) como JSON más columnas de control
  (`table`, `id`, `updatedAt`, `deviceId`, `rev`, `seq`).
- **clients, expenses, inventory**: gana la versión con `updatedAt` mayor (*last-writer-wins*);
  si empatan, gana el `deviceId` mayor. Por eso conviene que los relojes de los
  dispositivos estén en hora ("Probar conexión" avisa si difieren más de 2 minutos).
- **movements y audit** sólo se agregan (nunca se modifican).
- Cada fila aceptada recibe un número `seq` global; cada dispositivo pide "lo que haya
  después de mi cursor", en páginas de 2000 (`more: true`). Al que envía no se le devuelve
  lo que acaba de mandar.
- Las eliminaciones definitivas ("purgar") viajan en el registro de actividad y se replican.
- **No se sincronizan**: fotos de evidencia, notificaciones y ajustes (son de cada dispositivo).
  Borrar los datos de un dispositivo no borra el servidor: al volver a sincronizar se descargan.

### Notificaciones push del servidor

Tras cada sincronización, a los dispositivos suscritos **distintos del que hizo el cambio**:

- **Stock bajo**: un artículo pasa a stock ≤ mínimo → "Stock bajo: Batería A52 (quedan 1)".
- **Equipo listo**: un cliente pasa a "Listo para entregar" → "Equipo listo para entregar: Ana · Apple iPhone 13".
- **Resumen diario** (si `REPARO_DAILY_HOUR`): cobrado, gastado y ganancia del día, a todos.

El mensaje viaja cifrado de extremo a extremo (RFC 8291, `aes128gcm`) y firmado con VAPID
(RFC 8292). Las suscripciones que el servicio push da por vencidas (404/410) se eliminan solas.

---

## Despliegue en un VPS (opcional)

Útil si quieres sincronizar desde fuera del taller.

```bash
# en el servidor (Node 22+)
git clone … reparo && cd reparo && npm ci && npm run build
REPARO_TOKEN=… REPARO_VAPID_SUBJECT=mailto:tu@correo.com REPARO_HOST=127.0.0.1 npm run server
```

Ponlo detrás de un proxy con HTTPS (Caddy lo hace solo):

```
reparo.tudominio.com {
  reverse_proxy 127.0.0.1:8787
}
```

Y un servicio de systemd (`/etc/systemd/system/reparo.service`):

```ini
[Unit]
Description=Reparo
After=network.target

[Service]
WorkingDirectory=/opt/reparo
ExecStart=/usr/bin/node server/index.mjs
Environment=REPARO_HOST=127.0.0.1
Environment=REPARO_TOKEN=pon-aqui-un-token-largo
Environment=REPARO_VAPID_SUBJECT=mailto:tu@correo.com
Environment=REPARO_DAILY_HOUR=20
Environment=TZ=America/Mexico_City
Restart=on-failure
User=reparo

[Install]
WantedBy=multi-user.target
```

El servidor se detiene ordenadamente con `Ctrl+C` o `systemctl stop` (SIGINT/SIGTERM):
termina lo pendiente y cierra la base de datos sin perder nada.

---

## Respaldo

Todo el estado del servidor está en `server/data/` (o `REPARO_DATA_DIR`):

- `reparo.db` (+ `reparo.db-wal`, `reparo.db-shm` mientras corre): los datos sincronizados.
- `vapid.json`: las llaves de Web Push. **Si lo pierdes**, los dispositivos tendrán que volver a
  activar las notificaciones. Trátalo como un secreto.

Copia de seguridad en caliente, sin detener el servidor:

```bash
sqlite3 server/data/reparo.db ".backup 'respaldo-$(date +%F).db'"
cp server/data/vapid.json respaldo-vapid.json
```

O detén el servidor y copia la carpeta `server/data/` completa. Para restaurar, vuelve a
ponerla en su lugar: los dispositivos detectan el cambio y reenvían lo que falte.

Recuerda que cada dispositivo también puede exportar su propio respaldo desde **Ajustes**.

---

## Pruebas

```bash
node --test server/                              # unitarias + extremo a extremo (servidor real)
node server/tools/simular-dispositivos.mjs       # simulación de dos dispositivos, con resumen
npm test                                         # Vitest, incluye server/sync-client.spec.ts (cliente real)
```

Cubren: fusión LWW y append-only, cursores y paginación, purgas, el cifrado `aes128gcm`
contra el vector de prueba del RFC 8291 (sección 5), la firma y validación del JWT VAPID,
CORS, token, estáticos (ETag, brotli/gzip) y el arranque/cierre del proceso.
