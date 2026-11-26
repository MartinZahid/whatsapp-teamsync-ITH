// CAPA 1 · TRANSPORTE — API de avisos del portal (pestaña En vivo).
//
// GUÍA DE LECTURA:
//   GET /api/portal/avisos/ayuda
//       -> [{ agente, estado, conversacion, desde }]  quién pide ayuda ahora
//   GET /api/portal/avisos/duplicidades?desde=<segundos Unix>
//       -> [{ id, contacto, agentes, cuando }]  alertas desde esa fecha
//          (sin `desde`: las de las últimas 24 h; máximo 10)
//   Las fechas van en segundos Unix (UTC); el portal las muestra en hora local.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Avisos } from '../../logica/avisos.js'
import { responder } from './comun.js'

// `avisos` = null si el servidor corre sin base (DB_PATH=off).
export function apiAvisos(req: IncomingMessage, res: ServerResponse, avisos: Avisos | null): void {
  if (!avisos) return responder(res, 503, { error: 'El servidor corre sin base de datos' })
  if (req.method !== 'GET') return responder(res, 405, { error: 'Método no permitido' })

  const url = new URL(req.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/portal/avisos/ayuda') return responder(res, 200, avisos.ayuda())

  if (url.pathname === '/api/portal/avisos/duplicidades') {
    const desde = url.searchParams.get('desde')
    return responder(res, 200, avisos.duplicidades(desde ? Number(desde) : null))
  }

  responder(res, 404, { error: 'Ruta no encontrada' })
}
