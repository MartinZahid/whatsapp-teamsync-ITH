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

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { RoomManager } from './room-manager.js'
import { ErrorMessage, isAttendingMessage, WSMessage } from '../../shared/types.js'
import { APP_VERSION } from '../../shared/version.js'

// Configuración (se puede sobreescribir con variables de entorno PORT y HOST).
const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
const PING_INTERVAL = 30000    // ping cada 30 s para detectar conexiones muertas
const HEARTBEAT_INTERVAL = 30000 // revisión del heartbeat cada 30 s

// Registro de agentes y presencia (sala compartida). UNA sola instancia.
const roomManager = new RoomManager()

// `setInterval` ejecuta la función cada X milisegundos, para siempre.
// Aquí: revisa cada 30 s qué agentes dejaron de dar señal.
setInterval(() => roomManager.checkHeartbeats(), HEARTBEAT_INTERVAL)

// Servidor HTTP básico. Por ahora solo confirma que el servicio está activo.
// (Más adelante aquí se servirán el dashboard y sus archivos.)
const httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('WhatsApp Team Sync - servidor WebSocket activo\n')
})

// El WebSocket se monta sobre el mismo servidor HTTP y puerto.
// `{ server: httpServer }` = comparte el puerto; no se abre otro.
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  // Envía los mensajes pequeños sin esperar, para reducir la latencia.
  const sock = req.socket
  if (sock && typeof sock.setNoDelay === 'function') sock.setNoDelay(true)

  // Id del agente, una vez que se identifica al conectarse.
  let agentId: string | null = null

  // Mensaje de bienvenida al conectarse.
  // `JSON.stringify` convierte un objeto en texto para enviarlo por el socket;
  // al otro lado se recupera con `JSON.parse` (ver test-client.mjs).
  ws.send(JSON.stringify({
    type: 'WELCOME',
    message: 'Conectado al servidor de WhatsApp Team Sync',
    protocol: APP_VERSION
  }))

  ws.on('message', (data: Buffer) => {
    let message: WSMessage
    try {
      message = JSON.parse(data.toString())
    } catch {
      const error: ErrorMessage = {
        type: 'ERROR',
        code: 'PARSE_ERROR',
        message: 'Formato de mensaje inválido'
      }
      ws.send(JSON.stringify(error))
      return
    }

    // El primer mensaje debe identificar al agente (ATTENDING con su nombre).
    if (!agentId) {
      if (isAttendingMessage(message) && message.agent) {
        agentId = roomManager.register(ws, message.agent)
        roomManager.sendInitialState(agentId)
        // El primer ATTENDING identifica al agente y además fija su estado,
        // para que quede "Atendiendo" y no solo registrado como disponible.
        roomManager.handleMessage(agentId, message)
      } else {
        const error: ErrorMessage = {
          type: 'ERROR',
          code: 'AUTH_REQUIRED',
          message: 'El primer mensaje debe incluir el nombre del agente'
        }
        ws.send(JSON.stringify(error))
      }
      return
    }

    // Mensajes posteriores: actualizan el estado del agente.
    roomManager.handleMessage(agentId, message)
  })

  // Ping periódico para detectar conexiones muertas.
  // `readyState` indica el estado del socket; OPEN = conectado y usable.
  // `clearInterval` detiene el temporizador cuando la conexión ya no sirve.
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping()
    else clearInterval(ping)
  }, PING_INTERVAL)

  ws.on('error', (err) => console.error('[Servidor] Error de WebSocket:', err))
  ws.on('close', () => {
    clearInterval(ping)
    if (agentId) roomManager.disconnect(agentId)
  })
})

wss.on('error', (err) => console.error('[Servidor] Error del servidor:', err))

httpServer.listen(PORT, HOST, () => {
  console.log(`[Servidor] HTTP + WebSocket escuchando en http://${HOST}:${PORT}`)
})
