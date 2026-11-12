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

// Busca un agente ACTIVO por nombre; si no existe lo da de alta.
// (Alta automática provisional: ver ADR-001; luego se hará desde el dashboard.)
export function buscarOCrearAgente(base: BaseDeDatos, nombre: string, agentId: string): FilaAgente {
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

// Baja LÓGICA: no se borra la fila para no romper sesiones y eventos viejos.
export function darDeBajaAgente(base: BaseDeDatos, id: number): void {
  base.ejecutar('UPDATE agents SET active = 0 WHERE id = ?', [id])
}