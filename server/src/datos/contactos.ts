// CAPA 3 · DATOS — tabla `contacts`.
//
// GUÍA DE LECTURA:
//   Un contacto se crea la primera vez que un agente abre su chat.
//   `wa_id` = nombre NORMALIZADO (sin espacios de más, en minúsculas), así
//   "Juan  Pérez" y "juan pérez" son el mismo contacto.
//   `name` = el nombre tal como se vio la última vez.

import { normalizeContact } from '../../../shared/types.js'
import type { BaseDeDatos } from './conexion.js'
import { ahora } from './tiempo.js'

// Devuelve el id del contacto; lo crea si es nuevo o actualiza `last_seen`.
export function registrarContacto(base: BaseDeDatos, nombreVisto: string): number {
  const waId = normalizeContact(nombreVisto)
  const nombre = nombreVisto.trim()
  const t = ahora()

  const existente = base.una<{ id: number }>('SELECT id FROM contacts WHERE wa_id = ?', [waId])
  if (existente) {
    base.ejecutar('UPDATE contacts SET name = ?, last_seen = ? WHERE id = ?', [nombre, t, existente.id])
    return existente.id
  }

  const { ultimoId } = base.ejecutar(
    'INSERT INTO contacts (wa_id, name, first_seen, last_seen, active) VALUES (?, ?, ?, ?, 1)',
    [waId, nombre, t, t]
  )
  return ultimoId
}