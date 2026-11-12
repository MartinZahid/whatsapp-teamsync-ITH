
// GUÍA DE LECTURA:
//   `interface` = un contrato: lista de funciones SIN código. RoomManager solo
//   conoce este contrato, no sabe si detrás hay SQLite o nada. Así:
//     · BitacoraSqlite (bitacora-sqlite.ts) guarda de verdad.
//     · BitacoraNula (abajo) no hace nada: sirve con DB_PATH=off y en pruebas.

import type { Agent, AgentStatus } from '../../../shared/types.js'

export interface Bitacora {
  // El agente se identificó (primer mensaje o reconexión).
  agenteConectado(agente: Agent): void
  // Se llama DESPUÉS de cambiar el estado, con el estado y chat que tenía antes.
  cambioDeEstado(agente: Agent, antes: AgentStatus, chatAntes: string | null, motivo?: string): void
  // Pidió (true) o canceló (false) ayuda. No cambia el estado (RN-03).
  ayuda(agente: Agent, solicita: boolean): void
  // Dos o más agentes en el mismo chat (RN-07). `agentes[0]` es quien llegó.
  duplicidad(agentes: Agent[]): void
  // Baja del agente (lógica: la fila se conserva).
  bajaAgente(agente: Agent): void
}

export class BitacoraNula implements Bitacora {
  agenteConectado(): void {}
  cambioDeEstado(): void {}
  ayuda(): void {}
  duplicidad(): void {}
  bajaAgente(): void {}
}