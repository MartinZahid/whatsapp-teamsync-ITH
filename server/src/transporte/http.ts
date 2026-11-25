// CAPA 1 · TRANSPORTE — peticiones HTTP.
//
// GUÍA DE LECTURA:
//   1. API (JSON):
//        GET /api/agentes  -> lista de agentes dados de alta (la usa el popup
//                             de la extensión para mostrar a quién elegir).
//      Gestión de agentes desde el portal (ver logica/gestion-agentes.ts):
//        GET    /api/portal/agentes                 -> todos, con su estado en vivo
//        POST   /api/portal/agentes                 -> alta    { empleado, nombre }
//        PUT    /api/portal/agentes/:id             -> editar  { empleado, nombre }
//        DELETE /api/portal/agentes/:id             -> baja (pasa a Inactivos)
//        POST   /api/portal/agentes/:id/reactivar   -> reactivar
//      Errores: { "error": "mensaje para el usuario" } con 400, 404 o 409.
//   2. Portal web (dashboard): cualquier otra ruta entrega un archivo de la
//      carpeta `portal-web/` (HTML, CSS). "/" entrega el login.
//        http://localhost:3001/              -> portal-web/login.html
//        http://localhost:3001/en-vivo.html  -> portal-web/en-vivo.html
//   Más adelante aquí se agregan el login real y las rutas de cada pestaña.

import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import type { AgenteRegistrado } from '../datos/bitacora.js'
import type { ErrorGestion, GestionAgentes } from '../logica/gestion-agentes.js'

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

// `gestion` = null si el servidor corre sin base (DB_PATH=off).
export function crearManejadorHttp(agentes: FuenteAgentes, gestion: GestionAgentes | null) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    // Solo la ruta, sin "?usuario=..." ni otros parámetros.
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname

    if (ruta.startsWith('/api/portal/agentes')) {
      // Leer el cuerpo es asíncrono; un error inesperado responde 500.
      atenderGestion(req, res, ruta, gestion).catch(() => responder(res, 500, { error: 'Error del servidor' }))
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

// Rutas de gestión de agentes del portal.
async function atenderGestion(
  req: IncomingMessage,
  res: ServerResponse,
  ruta: string,
  gestion: GestionAgentes | null
): Promise<void> {
  if (!gestion) return responder(res, 503, { error: 'El servidor corre sin base de datos' })

  // "/api/portal/agentes", "/api/portal/agentes/7" o "/api/portal/agentes/7/reactivar"
  const partes = ruta.match(/^\/api\/portal\/agentes(?:\/(\d+))?(\/reactivar)?$/)
  if (!partes) return responder(res, 404, { error: 'Ruta no encontrada' })
  const id = partes[1] ? Number(partes[1]) : null
  const reactivar = Boolean(partes[2])

  if (req.method === 'GET' && id === null) return responder(res, 200, gestion.listar())
  if (req.method === 'POST' && id === null) {
    const cuerpo = await leerJson(req)
    return contestar(res, gestion.alta(cuerpo.empleado, cuerpo.nombre), 201)
  }
  if (req.method === 'PUT' && id !== null && !reactivar) {
    const cuerpo = await leerJson(req)
    return contestar(res, gestion.editar(id, cuerpo.empleado, cuerpo.nombre))
  }
  if (req.method === 'DELETE' && id !== null && !reactivar) return contestar(res, gestion.baja(id))
  if (req.method === 'POST' && id !== null && reactivar) return contestar(res, gestion.reactivar(id))

  responder(res, 405, { error: 'Método no permitido' })
}

// Resultado de una acción: { ok: true } o el error con su código.
function contestar(res: ServerResponse, error: ErrorGestion, codigoOk = 200): void {
  if (error) responder(res, error.codigo, { error: error.mensaje })
  else responder(res, codigoOk, { ok: true })
}

function responder(res: ServerResponse, codigo: number, datos: unknown): void {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(datos))
}

// Lee el cuerpo de la petición como JSON. Si no es JSON válido, devuelve {}
// (y la validación de la lógica responde "faltan datos").
async function leerJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let texto = ''
  for await (const trozo of req) {
    texto += trozo
    if (texto.length > 10_000) break // nadie manda tanto para un agente
  }
  try {
    const datos = JSON.parse(texto)
    return typeof datos === 'object' && datos !== null ? datos : {}
  } catch {
    return {}
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
