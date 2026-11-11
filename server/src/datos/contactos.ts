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
  const t = ahora()

  // Un solo SQL para los dos casos: si el `wa_id` ya existe (ON CONFLICT),
  // en vez de insertar actualiza el nombre y la última vez que se vio.
  base.ejecutar(
    `INSERT INTO contacts (wa_id, name, first_seen, last_seen, active) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(wa_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`,
    [waId, nombreVisto.trim(), t, t]
  )
  return base.una('SELECT id FROM contacts WHERE wa_id = ?', [waId])!.id as number
}
