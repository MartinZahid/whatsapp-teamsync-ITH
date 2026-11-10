// CAPA 3 · DATOS — tabla `agents`.
//
// GUÍA DE LECTURA:
//   Solo SQL sobre la tabla de agentes. No sabe nada de WebSocket ni de estados.
//   `?` en el SQL = parámetro: sql.js lo rellena con el valor del arreglo, así
//   el texto del usuario nunca se mezcla con el SQL (evita inyección SQL).

import type { BaseDeDatos } from './conexion.js'
import { ahora } from './tiempo.js'

export interface FilaAgente {
  id: number        // llave numérica (agents.id)
  agentId: string   // id de texto que usa el servidor (agents.agent_id)
  name: string
}

// Busca un agente ACTIVO por nombre; si no existe lo da de alta.
// (Alta automática provisional: ver ADR-001; luego se hará desde el dashboard.)
export function buscarOCrearAgente(base: BaseDeDatos, nombre: string, agentId: string): FilaAgente {
  const existente = buscarAgentePorNombre(base, nombre)
  if (existente) return existente

  base.db.run('INSERT INTO agents (agent_id, name, active, created_at) VALUES (?, ?, 1, ?)', [
    agentId,
    nombre,
    ahora()
  ])
  base.marcarCambio()
  return { id: ultimoId(base), agentId, name: nombre }
}

export function buscarAgentePorNombre(base: BaseDeDatos, nombre: string): FilaAgente | null {
  const consulta = base.db.prepare('SELECT id, agent_id, name FROM agents WHERE name = ? AND active = 1')
  consulta.bind([nombre])
  const fila = consulta.step() ? consulta.get() : null
  consulta.free()
  return fila ? { id: fila[0] as number, agentId: fila[1] as string, name: fila[2] as string } : null
}

// Todos los agentes activos (para cargarlos en memoria al arrancar).
export function listarAgentesActivos(base: BaseDeDatos): FilaAgente[] {
  const resultado = base.db.exec('SELECT id, agent_id, name FROM agents WHERE active = 1 ORDER BY id')
  if (resultado.length === 0) return []
  return resultado[0].values.map((f) => ({ id: f[0] as number, agentId: f[1] as string, name: f[2] as string }))
}

// Baja LÓGICA: no se borra la fila para no romper sesiones y eventos viejos.
export function darDeBajaAgente(base: BaseDeDatos, id: number): void {
  base.db.run('UPDATE agents SET active = 0 WHERE id = ?', [id])
  base.marcarCambio()
}

// Id que SQLite asignó en el último INSERT (AUTOINCREMENT).
export function ultimoId(base: BaseDeDatos): number {
  return base.db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
}