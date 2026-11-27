// CAPA 1 · TRANSPORTE — API de contactos del portal (pestaña Contactos).
//
// GUÍA DE LECTURA:
//   GET /api/portal/contactos      -> todos los contactos
//   PUT /api/portal/contactos/:id  -> ponerle nombre y número  { nombre, numero }
//   Errores: { "error": "mensaje para el usuario" } con 400 o 404.
//   Las reglas están en logica/contactos.ts.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Contactos } from '../../../logica/contactos.js'
import { leerJson, responder } from './comun.js'

// `contactos` = null si el servidor corre sin base (DB_PATH=off).
export async function apiContactos(
  req: IncomingMessage,
  res: ServerResponse,
  ruta: string,
  contactos: Contactos | null
): Promise<void> {
  if (!contactos) return responder(res, 503, { error: 'El servidor corre sin base de datos' })

  // "/api/portal/contactos" o "/api/portal/contactos/7"
  const partes = ruta.match(/^\/api\/portal\/contactos(?:\/(\d+))?$/)
  if (!partes) return responder(res, 404, { error: 'Ruta no encontrada' })
  const id = partes[1] ? Number(partes[1]) : null

  if (req.method === 'GET' && id === null) return responder(res, 200, contactos.listar())

  if (req.method === 'PUT' && id !== null) {
    const cuerpo = await leerJson(req)
    const error = contactos.editar(id, cuerpo.nombre, cuerpo.numero)
    return error ? responder(res, error.codigo, { error: error.mensaje }) : responder(res, 200, { ok: true })
  }

  responder(res, 405, { error: 'Método no permitido' })
}
