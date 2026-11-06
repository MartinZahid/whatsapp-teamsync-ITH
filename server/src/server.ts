// Punto de entrada del servidor: levanta el servidor HTTP y el WebSocket.
//
// GUÍA DE LECTURA — cómo se conecta todo:
//   - `http.createServer` crea un servidor HTTP normal (responde texto plano).
//   - `WebSocketServer` se "monta" sobre ese mismo servidor: así el mismo
//     puerto (3001) atiende HTTP y WebSocket a la vez.
//   - Todo es ORIENTADO A EVENTOS: no hay un bucle que pregunte "¿hay algo?".
//     En su lugar registramos funciones que se ejecutan cuando pasa algo:
//       · wss.on('connection', ...) -> llegó un cliente nuevo
//       · ws.on('message', ...)     -> llegó un mensaje
//       · ws.on('close', ...)       -> se cerró la conexión
//   - La lógica de presencia NO está aquí: se delega en `roomManager`.

import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { RoomManager } from './room-manager.js'
import type { ClientToServerMessage, ErrorCode } from '../../shared/types.js'
import { APP_VERSION } from '../../shared/version.js'

// Configuración (se puede sobreescribir con variables de entorno PORT y HOST).
const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
const HEARTBEAT_CHECK_MS = 30000 // revisión del heartbeat cada 30 s (RN-04)

// Registro de agentes y presencia (sala compartida). UNA sola instancia.
const roomManager = new RoomManager()

// `setInterval` ejecuta la función cada X milisegundos, para siempre.
// Aquí: revisa cada 30 s qué agentes dejaron de dar señal.
setInterval(() => roomManager.checkHeartbeats(), HEARTBEAT_CHECK_MS)

// Servidor HTTP básico. Por ahora solo confirma que el servicio está activo.
// (Más adelante aquí se servirán el dashboard y sus archivos.)
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('WhatsApp Team Sync - servidor WebSocket activo\n')
})

// El WebSocket comparte el puerto del servidor HTTP.
const wss = new WebSocketServer({ server: httpServer })

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  ws.send(JSON.stringify({ type: 'ERROR', code, message }))
}

wss.on('connection', (ws, req) => {
  // Envía los mensajes pequeños sin esperar, para reducir la latencia.
  req.socket.setNoDelay(true)

  // Id del agente, una vez que se identifica.
  let agentId: string | null = null

  // `JSON.stringify` convierte un objeto en texto para enviarlo por el socket.
  ws.send(JSON.stringify({
    type: 'WELCOME',
    message: 'Conectado al servidor de WhatsApp Team Sync',
    protocol: APP_VERSION
  }))

  ws.on('message', (data) => {
    let message: ClientToServerMessage
    try {
      message = JSON.parse(data.toString())
    } catch {
      sendError(ws, 'PARSE_ERROR', 'Formato de mensaje inválido')
      return
    }

    // El primer mensaje (cualquiera) identifica al agente por su nombre.
    if (!agentId) {
      if (typeof message?.agent !== 'string' || !message.agent.trim()) {
        sendError(ws, 'AUTH_REQUIRED', 'El primer mensaje debe incluir el nombre del agente')
        return
      }
      agentId = roomManager.register(ws, message.agent.trim())
      // Primero se aplica el estado que trae el mensaje y luego se manda el
      // estado inicial, para que el agente ya se vea con su estado real.
      roomManager.handleMessage(agentId, message)
      roomManager.sendInitialState(agentId)
      return
    }

    roomManager.handleMessage(agentId, message)
  })

  ws.on('error', (err) => console.error('[Servidor] Error de WebSocket:', err))
  ws.on('close', () => {
    if (agentId) roomManager.disconnect(agentId, ws)
  })
})

wss.on('error', (err) => console.error('[Servidor] Error del servidor:', err))

httpServer.listen(PORT, HOST, () => {
  console.log(`[Servidor] HTTP + WebSocket escuchando en http://${HOST}:${PORT}`)
})
