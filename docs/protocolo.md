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
| `DELETE_AGENT` | `agent` | Elimina al agente del registro. |
| `HEARTBEAT` | `agent` | Señal de actividad (cada 30 s). |
| `HELP_REQUEST` | `agent`, `requesting` | Solicita ayuda (`true`) o la cancela (`false`) sin cambiar de estado. |

## Mensajes del servidor al cliente

| Tipo | Campos | Descripción |
|---|---|---|
| `WELCOME` | `message`, `protocol` | Bienvenida al conectar. |
| `SERVER_INFO` | `version`, `agents` | Estado inicial tras registrarse. |
| `PRESENCE_UPDATE` | `agents` | Lista actualizada de agentes. |
| `DUPLICATE_ALERT` | `contact`, `agents`, `at` | Dos o más agentes atienden el mismo contacto. |
| `ERROR` | `code`, `message` | Error: `PARSE_ERROR`, `AUTH_REQUIRED` o `REPLACED`. |

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

Cuando un agente pasa a `Atendiendo` y otro agente ya está atendiendo el mismo
contacto, el servidor envía `DUPLICATE_ALERT` a **todos** los conectados:

```json
{
  "type": "DUPLICATE_ALERT",
  "contact": "Cliente SUSPIROS",
  "agents": [
    { "id": "Luis-...", "name": "Luis" },
    { "id": "Ana-...", "name": "Ana" }
  ],
  "at": 1760000000000
}
```

La comparación de contactos ignora mayúsculas, espacios al inicio/fin y
espacios repetidos. La alerta se emite al momento de la coincidencia; no se
repite mientras los agentes sigan en ese estado (reenviar `ATTENDING` con el
mismo contacto no vuelve a disparar la alerta). La extensión la muestra en el
panel flotante de WhatsApp y en el popup.
