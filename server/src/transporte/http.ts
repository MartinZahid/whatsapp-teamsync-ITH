// CAPA 1 · TRANSPORTE — peticiones HTTP.
//
// GUÍA DE LECTURA:
//   Por ahora solo hay una ruta de la API:
//     GET /api/agentes  -> lista de agentes dados de alta (la usa el popup
//                          de la extensión para mostrar a quién elegir).
//   Cualquier otra ruta responde un texto simple ("servidor activo").
//   Más adelante aquí se servirán el dashboard y su login.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgenteRegistrado } from '../datos/bitacora.js'

// Quien lea los agentes (la bitácora). null = no hay base.
type FuenteAgentes = () => AgenteRegistrado[] | null

export function crearManejadorHttp(agentes: FuenteAgentes) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method === 'GET' && req.url === '/api/agentes') {
      const lista = agentes()
      // La extensión hace la petición desde otro origen (chrome-extension://):
      // este encabezado le permite leer la respuesta (CORS).
      res.writeHead(lista ? 200 : 503, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(JSON.stringify(lista ? lista.map((a) => ({ name: a.name })) : { error: 'Sin base de datos' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('WhatsApp Team Sync - servidor WebSocket activo\n')
  }
}
