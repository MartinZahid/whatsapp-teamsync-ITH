// CAPA 1 · TRANSPORTE — peticiones HTTP.
//
// GUÍA DE LECTURA:
//   1. API (JSON):
//        GET /api/agentes  -> lista de agentes dados de alta (la usa el popup
//                             de la extensión para mostrar a quién elegir).
//      APIs del portal: un archivo por recurso en la carpeta `api/`.
//        /api/portal/agentes...  -> api/agentes.ts (CRUD de agentes)
//        /api/portal/avisos/...  -> api/avisos.ts  (ayuda y duplicidades)
//        /api/portal/historial/... -> api/historial.ts (sesiones y bitácora)
//        /api/portal/contactos...  -> api/contactos.ts (lista y editar nombre)
//   2. Portal web (dashboard): cualquier otra ruta entrega un archivo de la
//      carpeta `portal-web/` (HTML, CSS). "/" entrega el login.
//        http://localhost:3001/              -> portal-web/login.html
//        http://localhost:3001/en-vivo.html  -> portal-web/en-vivo.html
//   Más adelante aquí se agregan el login real y las rutas de cada pestaña.

import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import type { AgenteRegistrado } from '../datos/bitacora.js'
import type { Avisos } from '../logica/avisos.js'
import type { Contactos } from '../logica/contactos.js'
import type { GestionAgentes } from '../logica/gestion-agentes.js'
import type { Historial } from '../logica/historial.js'
import { apiAgentes } from './api/agentes.js'
import { apiAvisos } from './api/avisos.js'
import { apiContactos } from './api/contactos.js'
import { apiHistorial } from './api/historial.js'
import { responder } from './api/comun.js'

// Quien lea los agentes (la bitácora). null = no hay base.
type FuenteAgentes = () => AgenteRegistrado[] | null

// Carpeta del portal web. Es relativa a donde se arranca el servidor
// (`npm run server` se corre desde la raíz del repo, igual que `data/`).
const CARPETA_PORTAL = resolve('portal-web')

// Tipo de contenido según la extensión del archivo.
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

// `gestion`, `avisos`, `historial` y `contactos` = null si el servidor corre sin base (DB_PATH=off).
export function crearManejadorHttp(
  agentes: FuenteAgentes,
  gestion: GestionAgentes | null,
  avisos: Avisos | null,
  historial: Historial | null,
  contactos: Contactos | null
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

    if (ruta.startsWith('/api/portal/contactos')) {
      apiContactos(req, res, ruta, contactos).catch(() => responder(res, 500, { error: 'Error del servidor' }))
      return
    }

    if (req.method === 'GET' && ruta === '/api/agentes') {
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

    if (req.method === 'GET') {
      servirPortal(ruta, res)
      return
    }

    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Método no permitido\n')
  }
}

// Entrega un archivo de `portal-web/`. "/" = login.
function servirPortal(ruta: string, res: ServerResponse): void {
  const nombre = ruta === '/' ? 'login.html' : decodeURIComponent(ruta.slice(1))
  const archivo = resolve(CARPETA_PORTAL, nombre)

  // Seguridad: no dejar salir de la carpeta (por ejemplo "/../data/base.db").
  if (!archivo.startsWith(CARPETA_PORTAL + sep)) {
    noEncontrado(res)
    return
  }

  try {
    const contenido = readFileSync(archivo)
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' })
    res.end(contenido)
  } catch {
    noEncontrado(res) // no existe (o es una carpeta)
  }
}

function noEncontrado(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('No encontrado\n')
}
