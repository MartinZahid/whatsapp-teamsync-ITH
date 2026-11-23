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
