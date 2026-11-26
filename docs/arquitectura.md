# Arquitectura

Cliente-servidor, organizada en **4 capas**. `shared/types.ts` es el contrato
común entre todas.

| Capa | Dónde corre | Archivos | Estado |
|---|---|---|---|
| 1. Presentación | Navegador | `extension/` | Ya existe, sin cambios |
| | | `portal-web/` (dashboard) | Existe: pantallas y navegación (sin datos todavía) |
| 2. Transporte | Servidor | `server/src/transporte/websocket.ts` | Ya existe |
| | | `server/src/transporte/http.ts` (`GET /api/agentes` y archivos de `portal-web/`) | Existe; falta el login real y la API de cada pestaña |
| 3. Lógica | Servidor | `server/src/logica/room-manager.ts` | Ya existe; llama a la bitácora |
| 4. Datos | Servidor | `server/src/datos/` + SQLite en `data/` | Ya existe (agentes, contactos, sesiones, bitácora) |

```
 Navegador                     Servidor (Node)
┌──────────────┐  WebSocket  ┌──────────────┐   ┌──────────────────┐   ┌─────────────┐
│ extension/   │◄───────────►│ websocket.ts │──►│                  │   │ datos/      │
│ (service     │             ├──────────────┤   │ room-manager.ts  │──►│ repos + SQL │──► data/*.db
│  worker)     │             │ http/        │──►│                  │   │             │
├──────────────┤    HTTP     │ (router,     │   └──────────────────┘   └─────────────┘
│ portal-web/  │◄───────────►│  auth)       │
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
    http.ts            # reparte las peticiones HTTP y entrega portal-web/
    api/               # APIs del portal: un archivo por recurso
      comun.ts         #   responder() y leerJson()
      agentes.ts       #   CRUD de agentes (/api/portal/agentes)
      avisos.ts        #   ayuda y duplicidades (/api/portal/avisos/...)
      historial.ts     #   sesiones y bitácora (/api/portal/historial/...)
      contactos.ts     #   lista y editar nombre (/api/portal/contactos)
      reportes.ts      #   tarjetas y gráficas (/api/portal/reportes)
  logica/
    room-manager.ts    # Presencia, estados, duplicidad, heartbeat
  datos/               # SQLite (sql.js): conexión, esquema, agentes, contactos, bitácora
  herramientas/
    agentes.ts         # npm run agentes: alta/baja mientras no hay dashboard
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
  - `router.ts` — sirve `portal-web/` y la API JSON.
  - `auth.ts` — login, cookie de sesión y roles `consulta` / `gestion`.
- `portal-web/` — el dashboard (ya existe: una página HTML por pestaña, sin JavaScript todavía)
  - `login.html` — inicio de sesión ("/" del servidor).
  - `en-vivo.html`, `historial.html`, `reportes.html`, `respaldo.html`.
  - `css/comun.css` — lo que comparten todas (colores, barra, pestañas, tablas).
  - `css/<página>.css` — un archivo por página con sus estilos propios
    (`login.css`, `en-vivo.css`, ...). Cada HTML carga `comun.css` y el suyo.
  - `js/<página>.js` — solo la pantalla de cada página (tablas, ventanas, botones).
  - `js/consumo/` — consumo de la API, un archivo por recurso (igual que
    `server/src/transporte/api/`):
    - `comun.js` — `pedir()`, el único lugar con `fetch`.
    - `agentes.js` — `listarAgentes()`, `agregarAgente()`, `editarAgente()`,
      `eliminarAgente()`, `reactivarAgente()`.
    - `avisos.js` — `listarAyuda()`, `listarDuplicidades(desde)`.
    - `historial.js` — `listarSesiones(filtros, pagina)`, `listarEventos(filtros, pagina)`.
    - `contactos.js` — `listarContactos()`, `editarContacto(id, nombre, numero)`.
    - `reportes.js` — `obtenerReportes(desde, hasta)`.
  - `js/lib/chart.umd.min.js` — Chart.js 4 (copia local, funciona sin internet).
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
