// Punto de entrada del servidor: crea las piezas de cada capa y las conecta.
//
// GUÍA DE LECTURA — arquitectura por capas (ver docs/arquitectura.md):
//   - transporte/  recibe y envía mensajes (WebSocket; más adelante HTTP).
//   - logica/      decide qué pasa con la presencia (RoomManager).
//   - datos/       guarda la base SQLite (sql.js) en disco.
//   Este archivo no tiene lógica propia: solo arranca y une las capas.

import { createServer } from 'node:http'
import { BaseDeDatos } from './datos/conexion.js'
import { RoomManager } from './logica/room-manager.js'
import { attachWebSocket } from './transporte/websocket.js'

// Configuración (se puede sobreescribir con variables de entorno PORT y HOST).
const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
const HEARTBEAT_CHECK_MS = 30000 // revisión del heartbeat cada 30 s (RN-04)
// Archivo de la base. DB_PATH=off la desactiva (todo queda solo en memoria).
const DB_PATH = process.env.DB_PATH || 'data/whatsapp_team_sync.db'

// Datos: abre o crea la base antes de aceptar conexiones.
const base = DB_PATH === 'off' ? null : await BaseDeDatos.abrir(DB_PATH)

// Lógica: registro de agentes y presencia (sala compartida). UNA sola instancia.
const roomManager = new RoomManager()

// `setInterval` ejecuta la función cada X milisegundos, para siempre.
// Aquí: revisa cada 30 s qué agentes dejaron de dar señal.
setInterval(() => roomManager.checkHeartbeats(), HEARTBEAT_CHECK_MS)

// Transporte HTTP básico. Por ahora solo confirma que el servicio está activo.
// (Más adelante aquí se servirán el dashboard y su login, en transporte/http/.)
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('WhatsApp Team Sync - servidor WebSocket activo\n')
})

// Transporte WebSocket: comparte el puerto del servidor HTTP.
attachWebSocket(httpServer, roomManager)

httpServer.listen(PORT, HOST, () => {
  console.log(`[Servidor] HTTP + WebSocket escuchando en http://${HOST}:${PORT}`)
})

// Al detener el servidor (Ctrl+C) se guarda la base una última vez.
function apagar(): void {
  console.log('[Servidor] Apagando...')
  base?.cerrar()
  process.exit(0)
}
process.on('SIGINT', apagar)
process.on('SIGTERM', apagar)