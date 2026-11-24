// CAPA 1 · TRANSPORTE — peticiones HTTP.
//
// GUÍA DE LECTURA:
//   1. API (JSON):
//        GET /api/agentes  -> lista de agentes dados de alta (la usa el popup
//                             de la extensión para mostrar a quién elegir).
//   2. Dashboard: cualquier otra ruta entrega un archivo de la carpeta
//      `dashboard/` (HTML, CSS). "/" entrega el login.
//        http://localhost:3001/            -> dashboard/login.html
//        http://localhost:3001/index.html  -> dashboard/index.html (En vivo)
//   Más adelante aquí se agregan el login real y las rutas de cada pestaña.

import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import type { AgenteRegistrado } from '../datos/bitacora.js'

// Quien lea los agentes (la bitácora). null = no hay base.
type FuenteAgentes = () => AgenteRegistrado[] | null

// Carpeta del dashboard. Es relativa a donde se arranca el servidor
// (`npm run server` se corre desde la raíz del repo, igual que `data/`).
const CARPETA_DASHBOARD = resolve('dashboard')

// Tipo de contenido según la extensión del archivo.
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

export function crearManejadorHttp(agentes: FuenteAgentes) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    // Solo la ruta, sin "?usuario=..." ni otros parámetros.
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname

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
      servirDashboard(ruta, res)
      return
    }

    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Método no permitido\n')
  }
}

// Entrega un archivo de `dashboard/`. "/" = login.
function servirDashboard(ruta: string, res: ServerResponse): void {
  const nombre = ruta === '/' ? 'login.html' : decodeURIComponent(ruta.slice(1))
  const archivo = resolve(CARPETA_DASHBOARD, nombre)

  // Seguridad: no dejar salir de la carpeta (por ejemplo "/../data/base.db").
  if (!archivo.startsWith(CARPETA_DASHBOARD + sep)) {
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
