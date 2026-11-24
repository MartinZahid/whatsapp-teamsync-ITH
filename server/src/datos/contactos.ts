// CAPA 3 · DATOS — tabla `contacts`.
//
// GUÍA DE LECTURA:
//   Un contacto se crea la primera vez que un agente abre su chat.
//   `wa_id` = nombre NORMALIZADO (sin espacios de más, en minúsculas), así
//   "Juan  Pérez" y "juan pérez" son el mismo contacto.
//   `name`  = el nombre con el que se vio por primera vez. Después NO se
//             vuelve a escribir al abrir el chat, para no borrar el nombre
//             que le pongan desde el dashboard (es solo visual).
//   `phone` = si el chat aparece como número ("+52 662 184 3920"), el número
//             solo con dígitos ("526621843920"). Si es un nombre, queda NULL.

import { normalizeContact } from '../../../shared/types.js'
import type { BaseDeDatos } from './conexion.js'
import { ahora } from './tiempo.js'

// Devuelve el id del contacto; lo crea si es nuevo o actualiza `last_seen`.
export function registrarContacto(base: BaseDeDatos, nombreVisto: string): number {
  const waId = normalizeContact(nombreVisto)
  const nombre = nombreVisto.trim()
  const telefono = telefonoDe(nombre)
  const t = ahora()

  const existente = base.una<{ id: number }>('SELECT id FROM contacts WHERE wa_id = ?', [waId])
  if (existente) {
    // Solo la fecha. `COALESCE` llena `phone` en contactos creados antes de
    // este cambio, sin pisar uno que ya tenga.
    base.ejecutar('UPDATE contacts SET last_seen = ?, phone = COALESCE(phone, ?) WHERE id = ?', [
      t,
      telefono,
      existente.id
    ])
    return existente.id
  }

  const { ultimoId } = base.ejecutar(
    'INSERT INTO contacts (wa_id, name, phone, first_seen, last_seen, active) VALUES (?, ?, ?, ?, ?, 1)',
    [waId, nombre, telefono, t, t]
  )
  return ultimoId
}

// ¿El nombre del chat es un número de teléfono? WhatsApp Web muestra así los
// chats que no están agendados: "+52 662 184 3920", "+1 (555) 123-4567".
// Regla: solo trae dígitos, espacios, "+", "(", ")" o "-", y entre 8 y 15
// dígitos (15 es el máximo de un número internacional).
// Devuelve solo los dígitos, o null si no parece número.
export function telefonoDe(nombre: string): string | null {
  if (!/^\+?[\d\s()-]+$/.test(nombre.trim())) return null
  const digitos = nombre.replace(/\D/g, '')
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null
}
