// CAPA 3 · DATOS — tabla `agents`.
//
// GUÍA DE LECTURA:
//   Solo SQL sobre la tabla de agentes. No sabe nada de WebSocket ni de estados.
//   Usa base.ejecutar / base.una / base.todas (ver conexion.ts).

import type { BaseDeDatos } from './conexion.js'
import { ahora } from './tiempo.js'

export interface FilaAgente {
  id: number        // llave numérica (agents.id)
  agentId: string   // id de texto que usa el servidor (agents.agent_id)
  name: string
}

// Columnas renombradas a como se usan en TypeScript.
const COLUMNAS = 'id, agent_id AS agentId, name'

// Da de alta un agente (hoy desde `npm run agentes`; luego desde el dashboard).
// Si ya existe uno activo con ese nombre, lo devuelve sin duplicarlo.
export function buscarOCrearAgente(base: BaseDeDatos, nombre: string, agentId = idDeTexto(nombre)): FilaAgente {
  const existente = buscarAgentePorNombre(base, nombre)
  if (existente) return existente

  const { ultimoId } = base.ejecutar(
    'INSERT INTO agents (agent_id, name, active, created_at) VALUES (?, ?, 1, ?)',
    [agentId, nombre, ahora()]
  )
  return { id: ultimoId, agentId, name: nombre }
}

export function buscarAgentePorNombre(base: BaseDeDatos, nombre: string): FilaAgente | null {
  return base.una<FilaAgente>(`SELECT ${COLUMNAS} FROM agents WHERE name = ? AND active = 1`, [nombre])
}

// Todos los agentes activos (para cargarlos en memoria al arrancar).
export function listarAgentesActivos(base: BaseDeDatos): FilaAgente[] {
  return base.todas<FilaAgente>(`SELECT ${COLUMNAS} FROM agents WHERE active = 1 ORDER BY id`)
}

// Id de texto legible: "Ana Torres" -> "ana-torres-k3f9".
function idDeTexto(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

// Baja LÓGICA: no se borra la fila para no romper sesiones y eventos viejos.
export function darDeBajaAgente(base: BaseDeDatos, id: number): void {
  base.ejecutar('UPDATE agents SET active = 0 WHERE id = ?', [id])
}
// --- Para el portal (gestión de agentes) ---

export interface FilaAgentePortal extends FilaAgente {
  active: number     // 1 = activo, 0 = dado de baja
  createdAt: number  // fecha de alta (segundos Unix)
}

const COLUMNAS_PORTAL = `${COLUMNAS}, active, created_at AS createdAt`

// Todos los agentes, activos e inactivos, ordenados por nombre.
export function listarTodosLosAgentes(base: BaseDeDatos): FilaAgentePortal[] {
  return base.todas<FilaAgentePortal>(`SELECT ${COLUMNAS_PORTAL} FROM agents ORDER BY name`)
}

export function buscarAgentePorId(base: BaseDeDatos, id: number): FilaAgentePortal | null {
  return base.una<FilaAgentePortal>(`SELECT ${COLUMNAS_PORTAL} FROM agents WHERE id = ?`, [id])
}

// `agent_id` guarda el número de empleado (es único en toda la tabla).
export function buscarAgentePorEmpleado(base: BaseDeDatos, empleado: string): FilaAgentePortal | null {
  return base.una<FilaAgentePortal>(`SELECT ${COLUMNAS_PORTAL} FROM agents WHERE agent_id = ?`, [empleado])
}

export function actualizarAgente(base: BaseDeDatos, id: number, empleado: string, nombre: string): void {
  base.ejecutar('UPDATE agents SET agent_id = ?, name = ? WHERE id = ?', [empleado, nombre, id])
}

export function reactivarAgente(base: BaseDeDatos, id: number): void {
  base.ejecutar('UPDATE agents SET active = 1 WHERE id = ?', [id])
}
