// CAPA 2 · TRANSPORTE — canal WebSocket con la extensión.
//
// GUÍA DE LECTURA — qué hace este archivo:
//   - Recibe las conexiones y los mensajes de las extensiones.
//   - Convierte el texto a JSON y revisa lo mínimo (formato y nombre).
//   - NO decide nada sobre la presencia: todo se lo pasa a la lógica
//     (`roomManager`). Esta capa solo entrega y recibe.
//   - Todo es ORIENTADO A EVENTOS: registramos funciones que se ejecutan
//     cuando pasa algo:
//       · wss.on('connection', ...) -> llegó un cliente nuevo
//       · ws.on('message', ...)     -> llegó un mensaje
//       · ws.on('close', ...)       -> se cerró la conexión

import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { RoomManager } from '../logica/room-manager.js'
import type { ClientToServerMessage, ErrorCode } from '../../../shared/types.js'
import { APP_VERSION } from '../../../shared/version.js'

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  ws.send(JSON.stringify({ type: 'ERROR', code, message }))
}

// Monta el WebSocket sobre el servidor HTTP: así el mismo puerto atiende
// HTTP y WebSocket a la vez.
export function attachWebSocket(httpServer: Server, roomManager: RoomManager): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer })

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
  return wss
}
