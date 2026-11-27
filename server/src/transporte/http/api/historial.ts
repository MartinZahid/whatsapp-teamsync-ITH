// CAPA 1 · TRANSPORTE — API del Historial del portal (pestaña Historial).
//
// GUÍA DE LECTURA:
//   GET /api/portal/historial/sesiones?agente=&contacto=&desde=&hasta=&pagina=
//       -> { total, pagina, porPagina, filas: [sesiones] }
//   GET /api/portal/historial/eventos?agente=&contacto=&desde=&hasta=&pagina=
//       -> { total, pagina, porPagina, filas: [eventos de la bitácora] }
//   Todos los parámetros son opcionales. `agente` es el id del agente;
//   `desde` y `hasta` van en segundos Unix (UTC). 10 filas por página.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FiltrosCrudos, Historial } from '../../../logica/historial.js'
import { responder } from './comun.js'

// `historial` = null si el servidor corre sin base (DB_PATH=off).
export function apiHistorial(req: IncomingMessage, res: ServerResponse, historial: Historial | null): void {
  if (!historial) return responder(res, 503, { error: 'El servidor corre sin base de datos' })
  if (req.method !== 'GET') return responder(res, 405, { error: 'Método no permitido' })

  const url = new URL(req.url ?? '/', 'http://localhost')
  const filtros: FiltrosCrudos = {
    agente: url.searchParams.get('agente'),
    contacto: url.searchParams.get('contacto'),
    desde: url.searchParams.get('desde'),
    hasta: url.searchParams.get('hasta'),
    pagina: url.searchParams.get('pagina')
  }

  if (url.pathname === '/api/portal/historial/sesiones') return responder(res, 200, historial.sesiones(filtros))
  if (url.pathname === '/api/portal/historial/eventos') return responder(res, 200, historial.eventos(filtros))

  responder(res, 404, { error: 'Ruta no encontrada' })
}
