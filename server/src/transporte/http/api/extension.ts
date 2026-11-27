// CAPA 1 · TRANSPORTE — API que usa la extensión (no el portal).
//
// GUÍA DE LECTURA:
//   GET /api/agentes  -> [{ name }]  agentes dados de alta; el popup de la
//                        extensión los muestra para elegir con quién conectarse.
//   El tiempo real (presencia, heartbeat, duplicidad) NO va aquí: va por
//   WebSocket (transporte/websocket/).

import type { ServerResponse } from 'node:http'
import type { AgenteRegistrado } from '../../../datos/bitacora.js'

// Quien lea los agentes (la bitácora). null = no hay base.
export type FuenteAgentes = () => AgenteRegistrado[] | null

export function apiExtensionAgentes(res: ServerResponse, agentes: FuenteAgentes): void {
  const lista = agentes()
  // La extensión hace la petición desde otro origen (chrome-extension://):
  // este encabezado le permite leer la respuesta (CORS).
  res.writeHead(lista ? 200 : 503, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(lista ? lista.map((a) => ({ name: a.name })) : { error: 'Sin base de datos' }))
}
