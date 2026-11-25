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
y la cierra; la extensión que recibe `REPLACED` no intenta reconectarse.

## Mensajes del cliente al servidor

| Tipo | Campos | Descripción |
|---|---|---|
| `ATTENDING` | `agent`, `contact` | El agente está atendiendo un chat. |
| `AVAILABLE` | `agent` | El agente queda disponible. |
| `PAUSED` | `agent`, `reason?` | El agente pausa su atención. |
| `OFFLINE` | `agent` | El agente se marca desconectado. |
| `HEARTBEAT` | `agent` | Señal de actividad (cada 30 s). |
| `HELP_REQUEST` | `agent`, `requesting` | Solicita ayuda (`true`) o la cancela (`false`) sin cambiar de estado. |
| `WRITING` | `agent`, `contact` | El agente escribió en el chat que tiene abierto. La extensión lo manda **una vez por chat**. |
| `CHAT_DECISION` | `agent`, `contact`, `decision` | Respuesta al aviso de duplicidad: `take` (tomar) o `yield` (ceder). |

## Mensajes del servidor al cliente

| Tipo | Campos | Descripción |
|---|---|---|
| `WELCOME` | `message`, `protocol` | Bienvenida al conectar. |
| `SERVER_INFO` | `version`, `agents` | Estado inicial tras registrarse. |
| `PRESENCE_UPDATE` | `agents` | Lista actualizada de agentes. |
| `DUPLICATE_ALERT` | `contact`, `agents`, `at` | Dos o más agentes **escribieron** en el mismo chat. Solo lo reciben ellos. |
| `CHAT_DECISION` | `contact`, `agent`, `decision`, `at` | Otro agente del aviso tomó o cedió el chat. |
| `ERROR` | `code`, `message` | Error: `PARSE_ERROR` (no es JSON o no trae `type`), `AUTH_REQUIRED`, `UNKNOWN_AGENT` (el nombre no está dado de alta; la extensión deja de reintentar) o `REPLACED`. |

La baja de agentes ya **no** viaja por el WebSocket (ADR-001): cualquier
extensión podía darse de baja a sí misma. La hace el servidor (`npm run agentes`
y, después, el dashboard).

## HTTP

| Ruta | Respuesta |
|---|---|
| `GET /api/agentes` | `[{ "name": "Ana Torres" }, ...]`: agentes activos de la tabla `agents` (lo usa el popup). `503` si el servidor corre sin base. |

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

- El cliente envía `HEARTBEAT` cada 30 segundos.
- El servidor revisa cada 30 segundos y marca como `offline` a cualquier agente
  que lleve más de 60 segundos sin dar señal.
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
   página para que no se pase por alto): *"Luis Ramírez también está escribiendo
   en "Carlos Peña""*, con los botones **Tomar** y **Ceder**.
4. Al presionar uno, se le quita el aviso a quien eligió y la extensión manda
   `CHAT_DECISION`. El servidor lo registra (`chat_take` o `chat_yield`) y avisa
   a los demás involucrados:

```json
{ "type": "CHAT_DECISION", "contact": "Carlos Peña",
  "agent": { "id": "Luis-...", "name": "Luis Ramírez" }, "decision": "yield", "at": 1760000000000 }
```

   Ellos ven, en la misma ventana al centro, *"Luis Ramírez te cedió el chat"*
   o *"Luis Ramírez tomó el chat"*, con el botón **Entendido**.

Tomar o ceder es un **acuerdo entre agentes**: la extensión no puede sacar a
nadie de un chat de WhatsApp. La comparación de contactos ignora mayúsculas,
espacios al inicio/fin y espacios repetidos. Seguir escribiendo no repite el
aviso; si uno sale del chat y vuelve, tiene que volver a escribir para contar.
