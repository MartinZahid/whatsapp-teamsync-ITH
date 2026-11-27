// CAPA 1 · TRANSPORTE — API de reportes del portal (pestaña Reportes).
//
// GUÍA DE LECTURA:
//   GET /api/portal/reportes?desde=<seg>&hasta=<seg>
//       -> { resumen, porDia, porAgente, porHora, topContactos }
//   `desde` y `hasta` son opcionales (segundos Unix). Todo en una sola
//   respuesta: la página pinta las tarjetas y las gráficas con ella.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Reportes } from '../../../logica/reportes.js'
import { responder } from './comun.js'

// `reportes` = null si el servidor corre sin base (DB_PATH=off).
export function apiReportes(req: IncomingMessage, res: ServerResponse, reportes: Reportes | null): void {
  if (!reportes) return responder(res, 503, { error: 'El servidor corre sin base de datos' })
  if (req.method !== 'GET') return responder(res, 405, { error: 'Método no permitido' })

  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname !== '/api/portal/reportes') return responder(res, 404, { error: 'Ruta no encontrada' })

  responder(res, 200, reportes.generar(url.searchParams.get('desde'), url.searchParams.get('hasta')))
}
