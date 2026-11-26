// CAPA 3 · DATOS — consultas del Historial del portal: sesiones de atención
// (tabla `sessions`) y bitácora de eventos (tabla `events`), con filtros y
// paginación.

import type { BaseDeDatos } from './conexion.js'

// Filtros de la pantalla. null = sin filtro.
export interface FiltrosHistorial {
  agente: number | null    // agents.id
  contacto: string | null  // parte del nombre o del número
  desde: number | null     // segundos Unix (inclusive)
  hasta: number | null     // segundos Unix (inclusive)
}

type Valor = string | number

// Arma el WHERE de los filtros. `fecha` y `agente` son las columnas de cada tabla.
function condiciones(f: FiltrosHistorial, fecha: string, agente: string): { where: string; params: Valor[] } {
  const partes: string[] = []
  const params: Valor[] = []
  if (f.agente !== null) {
    partes.push(agente)
    // Un "?" por cada vez que aparece el agente (en eventos son dos).
    const huecos = agente.split('?').length - 1
    for (let i = 0; i < huecos; i++) params.push(f.agente)
  }
  if (f.contacto) {
    const digitos = f.contacto.replace(/\D/g, '')
    partes.push(digitos ? '(c.name LIKE ? OR c.phone LIKE ?)' : 'c.name LIKE ?')
    params.push(`%${f.contacto}%`)
    if (digitos) params.push(`%${digitos}%`)
  }
  if (f.desde !== null) {
    partes.push(`${fecha} >= ?`)
    params.push(f.desde)
  }
  if (f.hasta !== null) {
    partes.push(`${fecha} <= ?`)
    params.push(f.hasta)
  }
  return { where: partes.length ? `WHERE ${partes.join(' AND ')}` : '', params }
}

// ---------- Sesiones de atención ----------

export interface FilaSesion {
  id: number
  agente: string
  contacto: string
  inicio: number
  fin: number | null
  duracion: number | null
  estado: 'open' | 'closed'
}

const DESDE_SESIONES = `FROM sessions s JOIN contacts c ON c.id = s.contact_ref`

export function contarSesiones(base: BaseDeDatos, f: FiltrosHistorial): number {
  const { where, params } = condiciones(f, 's.started_at', 's.agent_ref = ?')
  return base.una<{ total: number }>(`SELECT COUNT(*) AS total ${DESDE_SESIONES} ${where}`, params)?.total ?? 0
}

// La más reciente primero.
export function listarSesiones(base: BaseDeDatos, f: FiltrosHistorial, limite: number, salto: number): FilaSesion[] {
  const { where, params } = condiciones(f, 's.started_at', 's.agent_ref = ?')
  return base.todas<FilaSesion>(
    `SELECT s.id, s.agent_name AS agente, c.name AS contacto, s.started_at AS inicio,
            s.ended_at AS fin, s.duration_seconds AS duracion, s.status AS estado
     ${DESDE_SESIONES} ${where}
     ORDER BY s.started_at DESC, s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limite, salto]
  )
}

// ---------- Bitácora de eventos ----------

export interface FilaEvento {
  id: number
  cuando: number
  agente: string
  tipo: string
  contacto: string | null
  detalle: string | null          // events.detail (p. ej. el motivo de la desconexión)
  duracion: number | null         // duración de su sesión (útil en 'chat_end')
  participantes: string | null    // "Luis, Ana" en las duplicidades
}

const DESDE_EVENTOS = `FROM events e
  LEFT JOIN contacts c ON c.id = e.contact_ref
  LEFT JOIN sessions s ON s.id = e.session_ref`

// Un agente "participa" en un evento si es suyo o si estuvo en una duplicidad.
const DEL_AGENTE = `(e.agent_ref = ? OR EXISTS (
  SELECT 1 FROM event_participants p WHERE p.event_ref = e.id AND p.agent_ref = ?))`

export function contarEventos(base: BaseDeDatos, f: FiltrosHistorial): number {
  const { where, params } = condiciones(f, 'e.created_at', DEL_AGENTE)
  return base.una<{ total: number }>(`SELECT COUNT(*) AS total ${DESDE_EVENTOS} ${where}`, params)?.total ?? 0
}

// El más reciente primero.
export function listarEventos(base: BaseDeDatos, f: FiltrosHistorial, limite: number, salto: number): FilaEvento[] {
  const { where, params } = condiciones(f, 'e.created_at', DEL_AGENTE)
  return base.todas<FilaEvento>(
    `SELECT e.id, e.created_at AS cuando, e.agent_name AS agente, e.type AS tipo,
            c.name AS contacto, e.detail AS detalle, s.duration_seconds AS duracion,
            (SELECT GROUP_CONCAT(a.name, ', ')
               FROM event_participants p JOIN agents a ON a.id = p.agent_ref
              WHERE p.event_ref = e.id) AS participantes
     ${DESDE_EVENTOS} ${where}
     ORDER BY e.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limite, salto]
  )
}
