# WhatsApp Team Sync

Servidor de presencia en tiempo real para equipos de atención al cliente que
trabajan con WhatsApp Web.

Este repositorio contiene, por ahora, el **servidor WebSocket** (presencia,
rooms y heartbeat). La extensión de Chrome y el portal de monitoreo se
añadirán más adelante.

## Requisitos

- Node.js 18 o superior

## Scripts

- `npm run build:server` — compila el servidor con TypeScript.
- `npm run server` — inicia el servidor en `http://localhost:3001`.
