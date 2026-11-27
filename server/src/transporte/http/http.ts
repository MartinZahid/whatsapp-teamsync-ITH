// CAPA 1 · TRANSPORTE — reparte las peticiones HTTP (portal web y popup).
// El canal de la extensión en tiempo real (WebSocket) está aparte, en
// `transporte/websocket/`.
//
// GUÍA DE LECTURA — este archivo solo decide a dónde va cada URL:
//   /api/agentes              -> api/extension.ts  (lista del popup de la extensión)
//   /api/portal/agentes...    -> api/agentes.ts    (CRUD de agentes)
//   /api/portal/avisos/...    -> api/avisos.ts     (ayuda y duplicidades)
//   /api/portal/historial/... -> api/historial.ts  (sesiones y bitácora)
//   /api/portal/contactos...  -> api/contactos.ts  (lista y editar nombre)
//   /api/portal/reportes      -> api/reportes.ts   (tarjetas y gráficas)
//   cualquier otro GET        -> portal-archivos.ts (páginas de portal-web/)
//   Para agregar una API nueva: crear api/<recurso>.ts y agregar aquí su `if`.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Avisos } from '../../logica/avisos.js'
import type { Contactos } from '../../logica/contactos.js'
import type { GestionAgentes } from '../../logica/gestion-agentes.js'
import type { Historial } from '../../logica/historial.js'
import type { Reportes } from '../../logica/reportes.js'
import { apiAgentes } from './api/agentes.js'
import { apiAvisos } from './api/avisos.js'
import { apiContactos } from './api/contactos.js'
import { apiExtensionAgentes, type FuenteAgentes } from './api/extension.js'
import { apiHistorial } from './api/historial.js'
import { apiReportes } from './api/reportes.js'
import { responder } from './api/comun.js'
import { servirPortal } from './portal-archivos.js'

// La lógica del portal (`gestion`, `avisos`, ...) = null si el servidor corre sin base (DB_PATH=off).
export function crearManejadorHttp(
  agentes: FuenteAgentes,
  gestion: GestionAgentes | null,
  avisos: Avisos | null,
  historial: Historial | null,
  contactos: Contactos | null,
  reportes: Reportes | null
) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    // Solo la ruta, sin "?usuario=..." ni otros parámetros.
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname

    if (ruta.startsWith('/api/portal/agentes')) {
      // Leer el cuerpo es asíncrono; un error inesperado responde 500.
      apiAgentes(req, res, ruta, gestion).catch(() => responder(res, 500, { error: 'Error del servidor' }))
      return
    }

    if (ruta.startsWith('/api/portal/avisos/')) {
      apiAvisos(req, res, avisos)
      return
    }

    if (ruta.startsWith('/api/portal/historial/')) {
      apiHistorial(req, res, historial)
      return
    }

    if (ruta.startsWith('/api/portal/reportes')) {
      apiReportes(req, res, reportes)
      return
    }

    if (ruta.startsWith('/api/portal/contactos')) {
      apiContactos(req, res, ruta, contactos).catch(() => responder(res, 500, { error: 'Error del servidor' }))
      return
    }

    if (req.method === 'GET' && ruta === '/api/agentes') {
      apiExtensionAgentes(res, agentes)
      return
    }

    if (req.method === 'GET') {
      servirPortal(ruta, res)
      return
    }

    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Método no permitido\n')
  }
}
