// CAPA 3 · DATOS — consultas de la pestaña Reportes.
//
// GUÍA DE LECTURA:
//   Son las consultas de reportes de la base (03_consultas_reportes.sql),
//   con un periodo: sesiones que EMPEZARON entre `desde` y `hasta`.
//   - Los tiempos solo cuentan sesiones cerradas (las abiertas aún no tienen duración).
//   - Días y horas se agrupan en la hora LOCAL del equipo donde corre el
//     servidor ('localtime'), así en Hermosillo salen en hora de Hermosillo.

import type { BaseDeDatos } from './conexion.js'

export interface Periodo {
  desde: number | null    // segundos Unix
  hasta: number | null
}

type Valor = string | number

// "WHERE s.started_at >= ? AND ..." según el periodo.
function enPeriodo(p: Periodo, columna: string, extra: string[] = []): { where: string; params: Valor[] } {
  const partes = [...extra]
  const params: Valor[] = []
  if (p.desde !== null) { partes.push(`${columna} >= ?`); params.push(p.desde) }
  if (p.hasta !== null) { partes.push(`${columna} <= ?`); params.push(p.hasta) }
  return { where: partes.length ? `WHERE ${partes.join(' AND ')}` : '', params }
}

const CERRADAS = "s.status = 'closed'"

// Tarjetas de arriba: tiempo total, sesiones, contactos distintos.
export function resumen(base: BaseDeDatos, p: Periodo): { segundos: number; sesiones: number; contactos: number } {
  const { where, params } = enPeriodo(p, 's.started_at', [CERRADAS])
  return base.una(
    `SELECT COALESCE(SUM(s.duration_seconds), 0) AS segundos, COUNT(*) AS sesiones,
            COUNT(DISTINCT s.contact_ref) AS contactos
     FROM sessions s ${where}`,
    params
  ) as { segundos: number; sesiones: number; contactos: number }
}

// Alertas de duplicidad en el periodo.
export function contarDuplicidades(base: BaseDeDatos, p: Periodo): number {
  const { where, params } = enPeriodo(p, 'e.created_at', ["e.type = 'duplicate_alert'"])
  return base.una<{ total: number }>(`SELECT COUNT(*) AS total FROM events e ${where}`, params)?.total ?? 0
}

// Tiempo atendido por día: [{ dia: '2026-11-26', segundos }]
export function tiempoPorDia(base: BaseDeDatos, p: Periodo): { dia: string; segundos: number }[] {
  const { where, params } = enPeriodo(p, 's.started_at', [CERRADAS])
  return base.todas(
    `SELECT date(s.started_at, 'unixepoch', 'localtime') AS dia, SUM(s.duration_seconds) AS segundos
     FROM sessions s ${where} GROUP BY dia ORDER BY dia`,
    params
  )
}

// Tiempo atendido por agente: [{ agente, segundos }], el que más primero.
export function tiempoPorAgente(base: BaseDeDatos, p: Periodo): { agente: string; segundos: number }[] {
  const { where, params } = enPeriodo(p, 's.started_at', [CERRADAS])
  return base.todas(
    `SELECT s.agent_name AS agente, SUM(s.duration_seconds) AS segundos
     FROM sessions s ${where} GROUP BY s.agent_ref ORDER BY segundos DESC`,
    params
  )
}

// Horas pico: sesiones que empezaron en cada hora del día: [{ hora: 9, sesiones }]
export function sesionesPorHora(base: BaseDeDatos, p: Periodo): { hora: number; sesiones: number }[] {
  const { where, params } = enPeriodo(p, 's.started_at')
  return base.todas(
    `SELECT CAST(strftime('%H', s.started_at, 'unixepoch', 'localtime') AS INTEGER) AS hora, COUNT(*) AS sesiones
     FROM sessions s ${where} GROUP BY hora ORDER BY hora`,
    params
  )
}

// Contactos más atendidos: [{ contacto, sesiones, segundos }]
export function contactosMasAtendidos(
  base: BaseDeDatos,
  p: Periodo,
  limite: number
): { contacto: string; sesiones: number; segundos: number }[] {
  const { where, params } = enPeriodo(p, 's.started_at', [CERRADAS])
  return base.todas(
    `SELECT c.name AS contacto, COUNT(*) AS sesiones, SUM(s.duration_seconds) AS segundos
     FROM sessions s JOIN contacts c ON c.id = s.contact_ref ${where}
     GROUP BY c.id ORDER BY sesiones DESC, segundos DESC LIMIT ?`,
    [...params, limite]
  )
}
