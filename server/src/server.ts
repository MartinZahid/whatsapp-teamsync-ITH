// Punto de entrada del servidor: levanta el servidor HTTP y el WebSocket.

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { ErrorMessage } from '../../shared/types.js'
import { APP_VERSION } from '../../shared/version.js'

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
const PING_INTERVAL = 30000

// Servidor HTTP básico. Por ahora solo confirma que el servicio está activo.
const httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('WhatsApp Team Sync - servidor WebSocket activo\n')
})

// El WebSocket se monta sobre el mismo servidor HTTP y puerto.
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  // Envía los mensajes pequeños sin esperar, para reducir la latencia.
  const sock = req.socket
  if (sock && typeof sock.setNoDelay === 'function') sock.setNoDelay(true)

  // Mensaje de bienvenida al conectarse.
  ws.send(JSON.stringify({
    type: 'WELCOME',
    message: 'Conectado al servidor de WhatsApp Team Sync',
    protocol: APP_VERSION
  }))

  ws.on('message', (data: Buffer) => {
    try {
      JSON.parse(data.toString())
    } catch {
      const error: ErrorMessage = {
        type: 'ERROR',
        code: 'PARSE_ERROR',
        message: 'Formato de mensaje inválido'
      }
      ws.send(JSON.stringify(error))
    }
  })

  // Ping periódico para detectar conexiones muertas.
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping()
    else clearInterval(ping)
  }, PING_INTERVAL)

  ws.on('error', (err) => console.error('[Servidor] Error de WebSocket:', err))
  ws.on('close', () => clearInterval(ping))
})

wss.on('error', (err) => console.error('[Servidor] Error del servidor:', err))

httpServer.listen(PORT, HOST, () => {
  console.log(`[Servidor] HTTP + WebSocket escuchando en http://${HOST}:${PORT}`)
})
