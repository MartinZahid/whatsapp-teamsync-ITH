# Arquitectura

Cliente-servidor, organizada en **4 capas**. `shared/types.ts` es el contrato
común entre todas.

| Capa | Dónde corre | Archivos | Estado |
|---|---|---|---|
| 1. Presentación | Navegador | `extension/` | Ya existe, sin cambios |
| | | `dashboard/` | Nuevo (aún no se crea) |
| 2. Transporte | Servidor | `server/src/transporte/websocket.ts` | Ya existe |
| | | `server/src/transporte/http/` (dashboard y login) | Nuevo (aún no se crea) |
| 3. Lógica | Servidor | `server/src/logica/room-manager.ts` | Ya existe; solo agregará llamadas a `datos/` |
| 4. Datos | Servidor | `server/src/datos/` + SQLite en `data/` | Nuevo (aún no se crea) |

```
 Navegador                     Servidor (Node)
┌──────────────┐  WebSocket  ┌──────────────┐   ┌──────────────────┐   ┌─────────────┐
│ extension/   │◄───────────►│ websocket.ts │──►│                  │   │ datos/      │
│ (service     │             ├──────────────┤   │ room-manager.ts  │──►│ repos + SQL │──► data/*.db
│  worker)     │             │ http/        │──►│                  │   │             │
├──────────────┤    HTTP     │ (router,     │   └──────────────────┘   └─────────────┘
│ dashboard/   │◄───────────►│  auth)       │
│ (api.js)     │             └──────────────┘
└──────────────┘
  1. Presentación             2. Transporte       3. Lógica             4. Datos
```

## Carpetas del servidor

Cada capa del servidor tiene su carpeta, así la arquitectura se ve al abrir
el proyecto:

```
server/src/
  server.ts            # Arranque: crea las piezas y las une (sin lógica)
  transporte/
    websocket.ts       # Canal con la extensión
    http/              # (nuevo) login y rutas del dashboard
  logica/
    room-manager.ts    # Presencia, estados, duplicidad, heartbeat
  datos/               # (nuevo) SQLite y repos
```

La extensión no se reorganiza: toda ella es la capa de presentación y su
estructura (`content/`, `background/`, `popup/`, `options/`) la marca Chrome.

## Reglas

1. Cada capa solo habla con la de al lado.
2. La presentación nunca toca la lógica ni la base.
3. Solo `datos/` tiene SQL.
4. En la extensión, solo el service worker habla con el servidor; en el
   dashboard, solo `api.js`.

## Contenido previsto de cada carpeta nueva

Estas carpetas se crean cuando empiece su paso del plan; hoy no existen.

- `server/src/datos/`
  - `database.ts` — abre SQLite y crea las tablas.
  - `sessions-repo.ts` — sesiones de trabajo (conexión → desconexión).
  - `events-repo.ts` — bitácora de cambios de estado, ayuda y duplicidad.
  - `contacts-repo.ts` — contactos atendidos y duración de cada atención.
  - `agent-status-repo.ts` — último estado de cada agente (para reinicios).
- `server/src/transporte/http/`
  - `router.ts` — sirve `dashboard/` y la API JSON.
  - `auth.ts` — login, cookie de sesión y roles `consulta` / `gestion`.
- `dashboard/`
  - `index.html`, `login.html`, `styles.css`
  - `app.js` — interfaz (En vivo, Historial, Reportes, Respaldo).
  - `api.js` — único archivo que hace `fetch` al servidor.
- `data/` — archivo SQLite (no se versiona).

## Orden de trabajo

1. Probar la rama `fix/estados-y-simplificacion` con WhatsApp real y
   fusionarla a `main`.
2. Capa de datos: implementar `datos/` (`database.ts` y los repos).
3. Conectar la lógica: agregar en `RoomManager` las llamadas a `datos/`
   (sesiones, eventos, contactos, agent_status).
4. Transporte HTTP: implementar `transporte/http/` con el login y las rutas del dashboard.
5. Presentación: el dashboard (En vivo, Historial, Reportes, Respaldo).
6. Pruebas de integración (iteración 4).

Con esto no se reescribe nada de lo que ya funciona: solo se agregan capas.
