# Protocolo WebSocket

El servidor atiende en `ws://localhost:3001` (el puerto se puede cambiar con la
variable de entorno `PORT`).

## Conexión

Al abrir la conexión el servidor envía un mensaje `WELCOME`.

El **primer mensaje** que envía el cliente debe ser un `ATTENDING` con el nombre
del agente; así queda registrado. Si el primer mensaje no identifica al agente,
el servidor responde con `ERROR` (`AUTH_REQUIRED`).

Si ya existe un agente con el mismo nombre, se **reutiliza su registro**
(reconexión): conserva su identidad y vuelve a estar disponible.

## Mensajes del cliente al servidor

| Tipo | Campos | Descripción |
|---|---|---|
| `ATTENDING` | `agent`, `contact`, `status` | El agente está atendiendo un chat. |
| `AVAILABLE` | `agent` | El agente queda disponible. |
| `PAUSED` | `agent`, `reason?` | El agente pausa su atención. |
| `OFFLINE` | `agent` | El agente se marca desconectado. |
| `DELETE_AGENT` | `agent` | Elimina al agente del registro. |
| `HEARTBEAT` | `agent` | Señal de actividad (cada 30 s). |

## Mensajes del servidor al cliente

| Tipo | Campos | Descripción |
|---|---|---|
| `WELCOME` | `message`, `protocol` | Bienvenida al conectar. |
| `SERVER_INFO` | `version`, `agents` | Estado inicial tras registrarse. |
| `PRESENCE_UPDATE` | `agents` | Lista actualizada de agentes. |
| `ERROR` | `code`, `message` | Error (por ejemplo `PARSE_ERROR`, `AUTH_REQUIRED`). |

## Estados del agente

| Estado | Etiqueta | Color |
|---|---|---|
| `active` | Atendiendo | `#ef4444` |
| `paused` | Pausado | `#f59e0b` |
| `available` | Disponible | `#22c55e` |
| `offline` | Desconectado | `#9ca3af` |

## Heartbeat

- El cliente envía `HEARTBEAT` cada 30 segundos.
- El servidor revisa cada 30 segundos y marca como `offline` a cualquier agente
  que lleve más de 60 segundos sin dar señal.
- Cuando se cierra la conexión, el agente también se marca como `offline`.
