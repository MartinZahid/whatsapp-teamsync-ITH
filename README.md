# WhatsApp Team Sync

Servidor de presencia en tiempo real para equipos de atención al cliente que
trabajan con WhatsApp Web.

Este repositorio contiene el **servidor WebSocket** (presencia, rooms y
heartbeat) y la **extensión de Chrome** (Manifest V3). El portal de monitoreo se
añadirá más adelante.

## Requisitos

- Node.js 18 o superior
- Google Chrome (para cargar la extensión)

## Instalación

```bash
npm install
```

## Scripts

- `npm run build:server` — compila el servidor con TypeScript.
- `npm run server` — inicia el servidor en `http://localhost:3001`.
- `npm run dev:server` — compila el servidor en modo vigilancia.
- `npm run build:extension` — compila la extensión en `extension/dist`.
- `npm run typecheck:extension` — revisa los tipos de la extensión.
- `npm run dev:extension` — recompila la extensión al cambiar archivos.

## Estructura

```
server/
  src/
    server.ts        # Servidor HTTP + WebSocket
    room-manager.ts  # Registro de agentes y presencia
  tsconfig.json
shared/
  types.ts           # Tipos y protocolo compartidos
  version.ts         # Versión del protocolo
extension/
  public/
    manifest.json    # Manifest V3
    icons/           # Iconos de la extensión
  src/
    background/      # Service worker
    content/         # Content script (panel en WhatsApp Web)
  popup/             # Interfaz del popup
  options/           # Página de opciones
  vite.config.ts     # Build de páginas y service worker
  vite.content.config.ts  # Build del content script (IIFE)
scripts/
  test-client.mjs    # Cliente de consola para pruebas
docs/
  protocolo.md       # Descripción del protocolo WebSocket
  decisiones.md      # Decisiones técnicas
```

## Uso

1. Compilar e iniciar el servidor:

   ```bash
   npm run build:server
   npm run server
   ```

2. En otra terminal, simular uno o varios agentes:

   ```bash
   node scripts/test-client.mjs Ana attending "Cliente SUSPIROS"
   node scripts/test-client.mjs Luis available
   ```

3. Observar cómo se actualiza la presencia. Al cerrar un cliente se marca como
   `Desconectado`; al volver a conectarlo con el mismo nombre recupera su perfil.

## Extensión en Chrome

1. Compilar:

   ```bash
   npm run build:extension
   ```

2. Abrir `chrome://extensions`, activar el **Modo de desarrollador** y pulsar
   **Cargar descomprimida**.
3. Seleccionar la carpeta `extension/dist`.
4. Abrir `chrome://extensions` y comprobar que el service worker de
   "WhatsApp Team Sync" aparece activo.

La extensión solo se activa en `https://web.whatsapp.com/`.

## Protocolo

Ver [docs/protocolo.md](docs/protocolo.md).
