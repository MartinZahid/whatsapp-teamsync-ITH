// CAPA 3 · DATOS — tabla `contacts`.
//
// GUÍA DE LECTURA:
//   Un contacto se crea la primera vez que un agente abre su chat.
//   `wa_id` = nombre NORMALIZADO (sin espacios de más, en minúsculas), así
//   "Juan  Pérez" y "juan pérez" son el mismo contacto.
//   `name` = el nombre tal como se vio la última vez.

import { normalizeContact } from '../../../shared/types.js'
import type { BaseDeDatos } from './conexion.js'
import { ultimoId } from './agentes.js'
import { ahora } from './tiempo.js'

// Devuelve el id del contacto; lo crea si es nuevo o actualiza `last_seen`.
export function registrarContacto(base: BaseDeDatos, nombreVisto: string): number {
  const waId = normalizeContact(nombreVisto)
  const nombre = nombreVisto.trim()
  const t = ahora()

  const consulta = base.db.prepare('SELECT id FROM contacts WHERE wa_id = ?')
  consulta.bind([waId])
  const id = consulta.step() ? (consulta.get()[0] as number) : null
  consulta.free()

  if (id !== null) {
    base.db.run('UPDATE contacts SET name = ?, last_seen = ? WHERE id = ?', [nombre, t, id])
    base.marcarCambio()
    return id
  }

  base.db.run(
    'INSERT INTO contacts (wa_id, name, first_seen, last_seen, active) VALUES (?, ?, ?, ?, 1)',
    [waId, nombre, t, t]
  )
  base.marcarCambio()
  return ultimoId(base)
}