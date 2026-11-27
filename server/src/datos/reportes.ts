// CAPA 3 · DATOS — consultas de la pestaña Reportes.
//
// GUÍA DE LECTURA:
//   Son las consultas de reportes de la base (03_consultas_reportes.sql), con
//   un periodo (`desde`/`hasta`) y, si se elige, un agente.
//   - Los tiempos de atención solo cuentan sesiones cerradas (las abiertas aún
//     no tienen duración) que EMPEZARON en el periodo.
//   - Los días se agrupan en la hora LOCAL del equipo donde corre el servidor
//     ('localtime'), así en Hermosillo salen en hora de Hermosillo.

import type { BaseDeDatos } from './conexion.js'

export interface Periodo {
  desde: number | null    // segundos Unix
  hasta: number | null
  agente: number | null   // id del agente; null = todos
}

type Valor = string | number

// Arma "WHERE ..." con el periodo sobre la columna de fecha y, si hay agente,
// la condición del agente (`delAgente` lleva un "?" que se llena con su id).
function filtro(p: Periodo, fecha: string, delAgente: string | null, extra: string[] = []) {
  const partes = [...extra]
  const params: Valor[] = []
  if (p.desde !== null) { partes.push(`${fecha} >= ?`); params.push(p.desde) }
  if (p.hasta !== null) { partes.push(`${fecha} <= ?`); params.push(p.hasta) }
  if (p.agente !== null && delAgente) { partes.push(delAgente); params.push(p.agente) }
  return { where: partes.length ? `WHERE ${partes.join(' AND ')}` : '', params }
}

const CERRADAS = "s.status = 'closed'"
const SESION_DEL_AGENTE = 's.agent_ref = ?'

// Tarjetas de arriba: tiempo total, sesiones, contactos distintos.
export function resumen(base: BaseDeDatos, p: Periodo): { segundos: number; sesiones: number; contactos: number } {
  const { where, params } = filtro(p, 's.started_at', SESION_DEL_AGENTE, [CERRADAS])
  return base.una(
    `SELECT COALESCE(SUM(s.duration_seconds), 0) AS segundos, COUNT(*) AS sesiones,
            COUNT(DISTINCT s.contact_ref) AS contactos
     FROM sessions s ${where}`,
    params
  ) as { segundos: number; sesiones: number; contactos: number }
}

// Alertas de duplicidad en el periodo (con agente: en las que participó).
export function contarDuplicidades(base: BaseDeDatos, p: Periodo): number {
  const { where, params } = filtro(
    p,
    'e.created_at',
    'EXISTS (SELECT 1 FROM event_participants x WHERE x.event_ref = e.id AND x.agent_ref = ?)',
    ["e.type = 'duplicate_alert'"]
  )
  return base.una<{ total: number }>(`SELECT COUNT(*) AS total FROM events e ${where}`, params)?.total ?? 0
}

// Tiempo atendido por día: [{ dia: '2026-11-26', segundos }]
export function tiempoPorDia(base: BaseDeDatos, p: Periodo): { dia: string; segundos: number }[] {
  const { where, params } = filtro(p, 's.started_at', SESION_DEL_AGENTE, [CERRADAS])
  return base.todas(
    `SELECT date(s.started_at, 'unixepoch', 'localtime') AS dia, SUM(s.duration_seconds) AS segundos
     FROM sessions s ${where} GROUP BY dia ORDER BY dia`,
    params
  )
}

// Sesiones cerradas una por una (para repartir su tiempo en las 24 horas).
export function sesionesCerradas(base: BaseDeDatos, p: Periodo): { agente: string; inicio: number; segundos: number }[] {
  const { where, params } = filtro(p, 's.started_at', SESION_DEL_AGENTE, [CERRADAS])
  return base.todas(
    `SELECT s.agent_name AS agente, s.started_at AS inicio, s.duration_seconds AS segundos
     FROM sessions s ${where}`,
    params
  )
}

// Tiempo en cada estado (consulta 3): cada cambio de estado dura hasta el
// siguiente cambio del mismo agente (LEAD). El último cambio del periodo dura
// hasta `fin` (el final del periodo o ahora).
// -> [{ agente, estado: 1 atendiendo | 2 disponible | 3 pausado, segundos }]
export function tiempoPorEstado(
  base: BaseDeDatos,
  p: Periodo,
  fin: number
): { agente: string; estado: number; segundos: number }[] {
  const { where, params } = filtro(p, 'e.created_at', 'e.agent_ref = ?', ['e.status_ref IS NOT NULL'])
  return base.todas(
    `SELECT agente, estado, SUM(MIN(COALESCE(siguiente, ?), ?) - inicio) AS segundos
     FROM (
       SELECT e.agent_ref, e.agent_name AS agente, e.status_ref AS estado, e.created_at AS inicio,
              LEAD(e.created_at) OVER (PARTITION BY e.agent_ref ORDER BY e.created_at, e.id) AS siguiente
       FROM events e ${where}
     )
     WHERE estado IN (1, 2, 3) AND inicio < ?
     GROUP BY agent_ref, estado`,
    [fin, fin, ...params, fin]
  )
}

// Resumen por agente: tiempo, sesiones, ayudas pedidas y duplicidades.
// Solo agentes con algo en el periodo.
export function resumenPorAgente(base: BaseDeDatos, p: Periodo): {
  agente: string
  segundos: number
  sesiones: number
  ayudas: number
  duplicidades: number
}[] {
  // Cada subconsulta usa el mismo periodo sobre su propia columna de fecha.
  const sesiones = filtro({ ...p, agente: null }, 's.started_at', null, [CERRADAS, 's.agent_ref = a.id'])
  const ayudas = filtro({ ...p, agente: null }, 'e.created_at', null, ["e.type = 'help_request'", 'e.agent_ref = a.id'])
  const duplicidades = filtro({ ...p, agente: null }, 'e.created_at', null, ['x.agent_ref = a.id'])
  const delAgente = p.agente !== null ? 'WHERE a.id = ?' : ''

  return base.todas(
    `SELECT * FROM (
       SELECT a.name AS agente,
         (SELECT COALESCE(SUM(s.duration_seconds), 0) FROM sessions s ${sesiones.where}) AS segundos,
         (SELECT COUNT(*) FROM sessions s ${sesiones.where}) AS sesiones,
         (SELECT COUNT(*) FROM events e ${ayudas.where}) AS ayudas,
         (SELECT COUNT(*) FROM event_participants x JOIN events e ON e.id = x.event_ref ${duplicidades.where}) AS duplicidades
       FROM agents a ${delAgente}
     )
     WHERE segundos > 0 OR ayudas > 0 OR duplicidades > 0
     ORDER BY segundos DESC, agente`,
    [
      ...sesiones.params,
      ...sesiones.params,
      ...ayudas.params,
      ...duplicidades.params,
      ...(p.agente !== null ? [p.agente] : [])
    ]
  )
}

// Contactos más atendidos: [{ contacto, sesiones, segundos }]
export function contactosMasAtendidos(
  base: BaseDeDatos,
  p: Periodo,
  limite: number
): { contacto: string; sesiones: number; segundos: number }[] {
  const { where, params } = filtro(p, 's.started_at', SESION_DEL_AGENTE, [CERRADAS])
  return base.todas(
    `SELECT c.name AS contacto, COUNT(*) AS sesiones, SUM(s.duration_seconds) AS segundos
     FROM sessions s JOIN contacts c ON c.id = s.contact_ref ${where}
     GROUP BY c.id ORDER BY sesiones DESC, segundos DESC LIMIT ?`,
    [...params, limite]
  )
}
