// CONSUMO DE LA API — agentes (server/src/transporte/api/agentes.ts).
//
// Una función por acción del CRUD. Las páginas usan estas funciones y nunca
// escriben las rutas ni hacen fetch por su cuenta.

import { pedir } from './comun.js'

const API = '/api/portal/agentes'

// Todos los agentes (activos e inactivos) con su estado en vivo.
export function listarAgentes() {
  return pedir('GET', API)
}

export function agregarAgente(empleado, nombre) {
  return pedir('POST', API, { empleado, nombre })
}

export function editarAgente(id, empleado, nombre) {
  return pedir('PUT', `${API}/${id}`, { empleado, nombre })
}

// Baja lógica: pasa a Inactivos.
export function eliminarAgente(id) {
  return pedir('DELETE', `${API}/${id}`)
}

export function reactivarAgente(id) {
  return pedir('POST', `${API}/${id}/reactivar`)
}
