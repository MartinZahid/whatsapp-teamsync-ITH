// Punto de entrada del servidor: crea las piezas de cada capa y las conecta.
//
// GUÍA DE LECTURA — arquitectura por capas (ver docs/arquitectura.md):
//   - transporte/  recibe y envía mensajes (WebSocket y HTTP).
//   - logica/      decide qué pasa con la presencia (RoomManager).
//   - datos/       guarda la base SQLite (sql.js) en disco.
//   Este archivo no tiene lógica propia: solo arranca y une las capas.

import { createServer } from 'node:http'
import { BitacoraNula } from './datos/bitacora.js'
import { BitacoraSqlite } from './datos/bitacorasqlite.js'
import { BaseDeDatos } from './datos/conexion.js'
import { GestionAgentes } from './logica/gestion-agentes.js'
import { RoomManager } from './logica/room-manager.js'
import { crearManejadorHttp } from './transporte/http.js'
import { attachWebSocket } from './transporte/websocket.js'

// Configuración (se puede sobreescribir con variables de entorno PORT y HOST).
const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
const HEARTBEAT_CHECK_MS = 5000 // revisión del heartbeat cada 5 s (RN-04)
// Archivo de la base. DB_PATH=off la desactiva (todo queda solo en memoria).
const DB_PATH = process.env.DB_PATH || 'data/whatsapp_team_sync.db'

// Datos: abre o crea la base antes de aceptar conexiones.
const base = DB_PATH === 'off' ? null : await BaseDeDatos.abrir(DB_PATH)

// Bitácora: con base guarda todo en SQLite; sin base no hace nada.
const bitacora = base ? new BitacoraSqlite(base) : new BitacoraNula()

// Lógica: registro de agentes y presencia (sala compartida). UNA sola instancia.
const roomManager = new RoomManager(bitacora)

// `setInterval` ejecuta la función cada X milisegundos, para siempre.
// Aquí: revisa cada 5 s qué agentes dejaron de dar señal (más de 15 s).
setInterval(() => roomManager.checkHeartbeats(), HEARTBEAT_CHECK_MS)

// Lógica: gestión de agentes desde el portal (solo si hay base).
const gestion = base ? new GestionAgentes(base, roomManager) : null

// Transporte HTTP: API para la extensión y el portal, y las páginas del portal.
const httpServer = createServer(crearManejadorHttp(() => bitacora.agentesRegistrados(), gestion))

// Transporte WebSocket: comparte el puerto del servidor HTTP.
attachWebSocket(httpServer, roomManager)

httpServer.listen(PORT, HOST, () => {
  console.log(`[Servidor] HTTP + WebSocket escuchando en http://${HOST}:${PORT}`)
})

// Al detener el servidor (Ctrl+C) se guarda la base una última vez.
function apagar(): void {
  console.log('[Servidor] Apagando...')
  roomManager.apagar() // cierra sesiones abiertas y registra 'disconnected'
  base?.cerrar()
  process.exit(0)
}
process.on('SIGINT', apagar)
process.on('SIGTERM', apagar)