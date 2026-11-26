// CAPA 1 · TRANSPORTE — API de agentes del portal (pestaña En vivo).
//
// GUÍA DE LECTURA — una ruta por acción del CRUD:
//   GET    /api/portal/agentes                 -> leer: todos, con su estado en vivo
//   POST   /api/portal/agentes                 -> crear (alta)  { empleado, nombre }
//   PUT    /api/portal/agentes/:id             -> editar        { empleado, nombre }
//   DELETE /api/portal/agentes/:id             -> baja (pasa a Inactivos)
//   POST   /api/portal/agentes/:id/reactivar   -> reactivar
//   Errores: { "error": "mensaje para el usuario" } con 400, 404 o 409.
//   Aquí solo se lee la petición y se responde; las reglas están en
//   logica/gestion-agentes.ts.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ErrorGestion, GestionAgentes } from '../../logica/gestion-agentes.js'
import { leerJson, responder } from './comun.js'

// `gestion` = null si el servidor corre sin base (DB_PATH=off).
export async function apiAgentes(
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

  // Leer
  if (req.method === 'GET' && id === null) return responder(res, 200, gestion.listar())

  // Crear
  if (req.method === 'POST' && id === null) {
    const cuerpo = await leerJson(req)
    return contestar(res, gestion.alta(cuerpo.empleado, cuerpo.nombre), 201)
  }

  // Editar
  if (req.method === 'PUT' && id !== null && !reactivar) {
    const cuerpo = await leerJson(req)
    return contestar(res, gestion.editar(id, cuerpo.empleado, cuerpo.nombre))
  }

  // Baja
  if (req.method === 'DELETE' && id !== null && !reactivar) return contestar(res, gestion.baja(id))

  // Reactivar
  if (req.method === 'POST' && id !== null && reactivar) return contestar(res, gestion.reactivar(id))

  responder(res, 405, { error: 'Método no permitido' })
}

// Resultado de una acción: { ok: true } o el error con su código.
function contestar(res: ServerResponse, error: ErrorGestion, codigoOk = 200): void {
  if (error) responder(res, error.codigo, { error: error.mensaje })
  else responder(res, codigoOk, { ok: true })
}
