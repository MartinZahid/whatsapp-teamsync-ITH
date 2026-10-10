# WhatsApp Team Sync

Servidor de presencia en tiempo real para equipos de atención al cliente que
trabajan con WhatsApp Web.

Este repositorio contiene, por ahora, el **servidor WebSocket** (presencia,
rooms y heartbeat). La extensión de Chrome y el portal de monitoreo se
añadirán más adelante.

## Requisitos

- Node.js 18 o superior

## Instalación

```bash
npm install
```

## Scripts

- `npm run build:server` — compila el servidor con TypeScript.
- `npm run server` — inicia el servidor en `http://localhost:3001`.
- `npm run dev:server` — compila el servidor en modo vigilancia.

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
scripts/
  test-client.mjs    # Cliente de consola para pruebas
docs/
  protocolo.md       # Descripción del protocolo WebSocket
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

## Protocolo

Ver [docs/protocolo.md](docs/protocolo.md).
