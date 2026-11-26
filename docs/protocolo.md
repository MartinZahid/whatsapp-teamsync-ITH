# Protocolo WebSocket

El servidor atiende en `ws://localhost:3001` (el puerto se puede cambiar con la
variable de entorno `PORT`).

## Conexión

Al abrir la conexión el servidor envía un mensaje `WELCOME`.

El **primer mensaje** que envía el cliente, sea del tipo que sea, identifica al
agente por su campo `agent` y además fija su estado (la extensión manda
directamente su estado real: `ATTENDING`, `AVAILABLE` o `PAUSED`). Después el
servidor responde con `SERVER_INFO`. Si el primer mensaje no trae `agent`, el
servidor responde con `ERROR` (`AUTH_REQUIRED`).

Si ya existe un agente con el mismo nombre, se **reutiliza su registro**
(reconexión) y conserva su identidad. Si la conexión anterior seguía abierta
(el mismo agente en otro navegador), el servidor le envía `ERROR` (`REPLACED`)
y la cierra; la extensión que recibe `REPLACED` no intenta reconectarse sola
(si no, dos navegadores con el mismo agente se tumbarían en bucle).

La extensión vuelve a intentar conectarse al **abrir WhatsApp** y al **elegir el
agente** en el popup (aunque sea el mismo), aunque antes se hubiera quedado
desconectada (`REPLACED`, `UNKNOWN_AGENT` o sin servidor). El popup muestra el
motivo de la desconexión.

## Mensajes del cliente al servidor

| Tipo | Campos | Descripción |
|---|---|---|
| `ATTENDING` | `agent`, `contact` | El agente está atendiendo un chat. |
| `AVAILABLE` | `agent` | El agente queda disponible. |
| `PAUSED` | `agent`, `reason?` | El agente pausa su atención. |
| `OFFLINE` | `agent` | El agente se marca desconectado. |
| `HEARTBEAT` | `agent` | Señal de actividad (cada 5 s, solo mientras WhatsApp está abierto). |
| `HELP_REQUEST` | `agent`, `requesting` | Solicita ayuda (`true`) o la cancela (`false`) sin cambiar de estado. |
| `WRITING` | `agent`, `contact` | El agente escribió en el chat que tiene abierto. La extensión lo manda **una vez por chat**. |

## Mensajes del servidor al cliente

| Tipo | Campos | Descripción |
|---|---|---|
| `WELCOME` | `message`, `protocol` | Bienvenida al conectar. |
| `SERVER_INFO` | `version`, `agents` | Estado inicial tras registrarse. |
| `PRESENCE_UPDATE` | `agents` | Lista actualizada de agentes. |
| `DUPLICATE_ALERT` | `contact`, `agents`, `at` | Dos o más agentes **escribieron** en el mismo chat. Solo lo reciben ellos. |
| `ERROR` | `code`, `message` | Error: `PARSE_ERROR` (no es JSON o no trae `type`), `AUTH_REQUIRED`, `UNKNOWN_AGENT` (el nombre no está dado de alta; la extensión deja de reintentar) o `REPLACED`. |

La baja de agentes ya **no** viaja por el WebSocket (ADR-001): cualquier
extensión podía darse de baja a sí misma. La hace el servidor (`npm run agentes`
y, después, el dashboard).

## HTTP

| Ruta | Respuesta |
|---|---|
| `GET /api/agentes` | `[{ "name": "Ana Torres" }, ...]`: agentes activos de la tabla `agents` (lo usa el popup). `503` si el servidor corre sin base. |

### Gestión de agentes (portal, pestaña En vivo)

El número de empleado se guarda en `agents.agent_id`. Los errores responden
`{ "error": "mensaje para el usuario" }`. `503` si el servidor corre sin base.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/portal/agentes` | — | `[{ id, empleado, nombre, activo, alta, estado, conversacion, atendiendoDesde }]`: todos los agentes (activos e inactivos) con su estado en vivo. |
| `POST /api/portal/agentes` | `{ empleado, nombre }` | Alta. `201`; `400` faltan datos; `409` nombre activo o número repetido. |
| `PUT /api/portal/agentes/:id` | `{ empleado, nombre }` | Editar. `200`; `400`; `404`; `409`. Si estaba conectado se le cierra la conexión y debe volver a elegir su nombre en la extensión. |
| `DELETE /api/portal/agentes/:id` | — | Baja lógica (pasa a Inactivos, se cierra su sesión). `200`; `404`. |
| `POST /api/portal/agentes/:id/reactivar` | — | Reactivar. `200`; `404`; `409` si ya hay otro agente activo con ese nombre. |

Los cambios se reflejan al momento en la presencia (extensión y portal) sin
reiniciar el servidor.

### Avisos (portal, pestaña En vivo)

| Ruta | Respuesta |
|---|---|
| `GET /api/portal/avisos/ayuda` | `[{ agente, estado, conversacion, desde }]`: quién pide ayuda **ahora** (presencia en vivo) y desde cuándo (último `help_request` de la bitácora). |
| `GET /api/portal/avisos/duplicidades?desde=<seg>` | `[{ id, contacto, agentes, cuando }]`: alertas de duplicidad desde esa fecha, la más reciente primero (máx. 10). Sin `desde`: últimas 24 h. El portal manda el inicio de su día. |

### Historial (portal, pestaña Historial)

| Ruta | Respuesta |
|---|---|
| `GET /api/portal/historial/sesiones` | `{ total, pagina, porPagina, filas: [{ id, agente, contacto, sinNombre, inicio, fin, duracion, abierta }] }`: sesiones de atención, la más reciente primero. |
| `GET /api/portal/historial/eventos` | `{ total, pagina, porPagina, filas: [{ id, cuando, tipo, agentes, contacto, sinNombre, duracion, motivo }] }`: bitácora de eventos, el más reciente primero. `agentes` trae los dos agentes en una duplicidad; `duracion` solo en `chat_end`; `motivo` solo en `disconnected`. |

Parámetros opcionales (los dos): `agente` (id), `contacto` (parte del nombre o
del número), `desde` y `hasta` (segundos Unix), `pagina` (desde 1). 10 filas por
página. Filtrar por agente incluye las duplicidades donde participó.

Las fechas van en segundos Unix (UTC); el portal las muestra en hora local. Ya no hace falta `npm run agentes` con el servidor
detenido.

Cada agente de la presencia (`agents`) incluye, entre otros campos, `requesting`
(`true` cuando pidió ayuda), que es independiente de su estado.

## Estados del agente

| Estado | Etiqueta | Color |
|---|---|---|
| `attending` | Atendiendo | `#ef4444` |
| `paused` | Pausado | `#f59e0b` |
| `available` | Disponible | `#22c55e` |
| `offline` | Desconectado | `#9ca3af` |

## Heartbeat

- El cliente envía `HEARTBEAT` cada 5 segundos, **solo mientras haya una
  pestaña de WhatsApp abierta**. Si se cierra WhatsApp, se cierra Chrome, el
  equipo hiberna o se va el internet, deja de llegar la señal.
- El servidor revisa cada 5 segundos y marca como `offline` a cualquier agente
  que lleve más de 15 segundos sin dar señal (en la práctica, entre 15 y 20 s).
- Recargar WhatsApp no corta la atención: la extensión no manda nada mientras
  la página se vuelve a abrir, y el chat sigue siendo el mismo.
- Si el servidor ya lo marcó `offline` con WhatsApp cerrado, la extensión olvida
  el chat; al volver a abrir WhatsApp manda su estado real.
- Sin conexión, el popup no muestra la última lista guardada (todos aparecen
  Desconectados).
- Cuando se cierra la conexión, el agente también se marca como `offline`.
- Si el servidor marcó `offline` a un agente cuyo socket sigue abierto y vuelve a
  recibir su heartbeat, la extensión detecta en `PRESENCE_UPDATE` que su estado
  no coincide y reenvía su estado real.

## Solicitud de ayuda (RN-03)

`HELP_REQUEST` con `requesting: true` marca al agente como solicitante de ayuda
**sin cambiar su estado ni su color**; con `requesting: false` la cancela. La
marca se conserva en la reconexión y se limpia cuando el agente pasa a
`OFFLINE`, se desconecta o deja de enviar heartbeat.

## Duplicidad (RN-07)

**Abrir un chat ya no es duplicidad.** Cuenta cuando **dos o más agentes
escriben** en el mismo chat (cambio del 25/11/2026, ver ADR-003):

1. La extensión detecta que el agente teclea en la caja de mensaje de WhatsApp y
   manda `WRITING` (una sola vez por chat; se reinicia al cambiar de chat, de
   estado o al reconectarse).
2. El servidor marca que ese agente escribió en ese chat. Si otro agente que
   tiene el mismo chat abierto **también escribió**, envía `DUPLICATE_ALERT`
   **solo a los involucrados** y lo registra en la bitácora (`duplicate_alert`
   y `event_participants`):

```json
{
  "type": "DUPLICATE_ALERT",
  "contact": "Carlos Peña",
  "agents": [
    { "id": "Luis-...", "name": "Luis Ramírez" },
    { "id": "Ana-...", "name": "Ana Torres" }
  ],
  "at": 1760000000000
}
```

3. A cada uno le aparece una **ventana al centro de WhatsApp** (oscurece la
   página para que no se pase por alto): *"Luis Ramírez también está atendiendo
   a "Carlos Peña""*, con el botón **Entendido** para cerrarla. Si el agente
   cambia de chat, la ventana se cierra sola.

La comparación de contactos ignora mayúsculas, espacios al inicio/fin y
espacios repetidos. Seguir escribiendo no repite el aviso; si uno sale del chat
y vuelve, tiene que volver a escribir para contar.
