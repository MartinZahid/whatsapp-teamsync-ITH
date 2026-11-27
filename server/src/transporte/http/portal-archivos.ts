// CAPA 1 · TRANSPORTE — entrega los archivos del portal web (dashboard).
//
// GUÍA DE LECTURA:
//   Cualquier ruta GET que no sea API entrega un archivo de `portal-web/`
//   (HTML, CSS, JS). "/" entrega el login.
//     http://localhost:3001/              -> portal-web/login.html
//     http://localhost:3001/en-vivo.html  -> portal-web/en-vivo.html

import { readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

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

// Entrega un archivo de `portal-web/`. "/" = login.
export function servirPortal(ruta: string, res: ServerResponse): void {
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
