# Decisiones técnicas

Registro breve de las decisiones que afectan al diseño del sistema.

## ADR-001: gestión de agentes (RF-14)

**Contexto.** El reporte preliminar pide "gestión de agentes" y el dashboard
incluye un control de acceso con permisos de consulta y de gestión. La extensión
solo necesita saber qué agente está en uso en ese navegador.

**Decisión.**

- El **alta y la eliminación de agentes** se hacen desde el **dashboard**, con
  un usuario de rol `gestion`.
- El **popup de la extensión solo elige** un agente de la lista; no crea ni
  elimina.
- El agente se identifica por **nombre**, y el servidor genera un **id interno**
  (`nombre-fecha-aleatorio`). Al reconectarse con el mismo nombre se reutiliza
  el registro para no perder su identidad.
- Los agentes viven en la tabla `agents`. Mientras el dashboard no exista, el
  alta y la baja se hacen con `npm run agentes` (con el servidor detenido). La
  extensión solo lee la lista con `GET /api/agentes`.

**Consecuencias.**

- Un mismo nombre no puede usarse en dos navegadores a la vez: el servidor
  considera la segunda conexión una reconexión y cierra la anterior.
- La baja se hace en el servidor (`RoomManager.darDeBaja`), que usará el
  dashboard. Se quitó `DELETE_AGENT` del WebSocket (18/11/2026) porque
  cualquier extensión podía darse de baja a sí misma.
- La extensión no requiere permisos especiales para gestionar agentes.

**Alternativas descartadas.**

- Gestionar agentes desde el popup: duplicaría funciones del dashboard y
  rompería la separación de permisos (`consulta` / `gestion`).
- Identificar solo por id generado: menos legible para el agente y para el
  historial del reporte.

## ADR-002: nombre y teléfono de los contactos (24/11/2026)

**Contexto.** La extensión solo conoce el nombre del chat tal como lo muestra
WhatsApp Web. Los chats no agendados aparecen como número
("+52 662 184 3920"). Desde el dashboard se quiere poder ponerles un nombre.

**Decisión.**

- El contacto se identifica por `wa_id` (el nombre del chat normalizado). Eso
  no cambia.
- `name` se guarda la primera vez y ya no se sobrescribe al abrir el chat. El
  nombre que se ponga desde el dashboard es solo visual: no cambia cómo se
  reconoce el contacto.
- Si el nombre del chat es un número (solo dígitos, espacios, `+`, `(`, `)`
  o `-`, y entre 8 y 15 dígitos), se guarda en `phone` solo con dígitos.

**Consecuencias / limitación.**

- Si después el número se agenda en el teléfono, el chat cambia de nombre y
  se registra como un contacto nuevo; el historial anterior se queda en el
  contacto del número. Lo mismo si un establecimiento escribe desde varios
  números: cada uno es un contacto.

**Alternativas descartadas (trabajo futuro).**

- "Unir contactos" desde el dashboard: requiere una columna nueva
  (`merged_into`), migrar la base y actualizar el diagrama ER y el
  diccionario. Se dejó fuera por tiempo.
- Leer el identificador interno del chat de WhatsApp (número con `@c.us`):
  lo resolvería de raíz, pero cambia la extensión y el protocolo y depende de
  la estructura de la página de WhatsApp Web.

## ADR-003: la duplicidad cuenta al escribir (25/11/2026)

**Contexto.** RN-07 avisaba en cuanto dos agentes tenían abierto el mismo chat.
Eso daba falsas alarmas: un agente que solo se asomaba a un chat ya contaba
como duplicidad, y el aviso era un texto pequeño en el panel.

**Decisión.**

- Es duplicidad cuando **los dos agentes escribieron** en el mismo chat. Abrirlo
  no cuenta.
- El aviso llega **solo a los agentes involucrados**, no a todo el equipo.
- El aviso es una **ventana al centro de WhatsApp** que oscurece la página:
  "Luis Ramírez también está atendiendo a "Carlos Peña"", con el botón
  **Entendido**.
- En la bitácora no cambia nada: `duplicate_alert` + `event_participants`.

**Consecuencias.**

- Los reportes de duplicidad cuentan menos casos (solo los conflictos reales).
- Detectar que se escribe depende del HTML de WhatsApp Web (selector de la caja
  de mensaje en `extension/src/content/escritura.ts`): hay que comprobarlo con
  WhatsApp real y ajustarlo si WhatsApp cambia.
- Cambia RN-07 del reporte preliminar: consultarlo con el asesor.

**Alternativa descartada.** Botones "Tomar" y "Ceder" en el aviso: se
probaron y se quitaron para mantenerlo sencillo.

## ADR-004: un agente, un navegador; conexión automática (25/11/2026)

**Contexto.** Si otra persona elegía el mismo agente en su extensión, el
servidor le quitaba la conexión al primero (`REPLACED`) y ese navegador ya no
se volvía a conectar solo: ni al abrir WhatsApp ni al elegir otra vez el mismo
agente (había que cambiar de agente y regresar).

**Decisión.**

- **Gana el que ya está conectado.** Si el agente está activo en otro navegador,
  el servidor rechaza la conexión nueva con `AGENT_IN_USE`.
- **Nunca queda atrapado.** Se libera si la conexión anterior se cerró, si ya está
  Desconectado o si lleva más de 60 s sin heartbeat; reiniciar el servidor
  libera todo.
- **El mismo navegador siempre se reconecta.** Cada navegador tiene un id al azar
  (`client`, guardado por la extensión) para no bloquearse a sí mismo tras un
  corte de internet.
- **Conexión automática.** Al abrir WhatsApp la extensión intenta conectarse; y en
  el popup, elegir el agente (aunque sea el mismo) vuelve a intentar.
- El popup muestra el motivo de la desconexión.

**Consecuencias.**

- Si alguien deja una extensión abierta con un agente, ese agente no se puede
  usar en otro navegador hasta que la cierre (o pasen 60 s sin señal).
- El agente se sigue identificando solo por su nombre (sin contraseña): es una
  limitación conocida para el alcance de la residencia.

