// CAPA 3 · DATOS — consultas de la bitácora para los avisos del portal
// (solicitudes de ayuda y alertas de duplicidad de la pestaña En vivo).

import type { BaseDeDatos } from './conexion.js'

// Cuándo pidió ayuda por última vez el agente (segundos Unix), o null.
export function ultimaSolicitudDeAyuda(base: BaseDeDatos, nombreAgente: string): number | null {
  const fila = base.una<{ cuando: number }>(
    `SELECT created_at AS cuando FROM events
      WHERE type = 'help_request' AND agent_name = ?
      ORDER BY id DESC LIMIT 1`,
    [nombreAgente]
  )
  return fila?.cuando ?? null
}

export interface FilaDuplicidad {
  id: number
  cuando: number           // segundos Unix
  contacto: string | null  // nombre del contacto (contacts.name)
  agentes: string | null   // "Luis Ramírez, Ana Torres" (de event_participants)
}

// Alertas de duplicidad desde `desde` (segundos Unix), la más reciente primero.
export function duplicidadesDesde(base: BaseDeDatos, desde: number, limite: number): FilaDuplicidad[] {
  return base.todas<FilaDuplicidad>(
    `SELECT e.id,
            e.created_at AS cuando,
            c.name AS contacto,
            (SELECT GROUP_CONCAT(a.name, ', ')
               FROM event_participants p JOIN agents a ON a.id = p.agent_ref
              WHERE p.event_ref = e.id) AS agentes
       FROM events e
       LEFT JOIN contacts c ON c.id = e.contact_ref
      WHERE e.type = 'duplicate_alert' AND e.created_at >= ?
      ORDER BY e.id DESC
      LIMIT ?`,
    [desde, limite]
  )
}
