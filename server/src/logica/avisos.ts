// CAPA 2 · LÓGICA — avisos de la pestaña En vivo del portal.
//
// GUÍA DE LECTURA:
//   - ayuda(): quién pide ayuda AHORA (de la presencia en vivo, RoomManager) y
//     desde cuándo (último 'help_request' en la bitácora).
//   - duplicidades(desde): alertas de duplicidad guardadas en la bitácora desde
//     una fecha (el portal manda el inicio de su día), con los agentes y el chat.

import type { AgentStatus } from '../../../shared/types.js'
import { duplicidadesDesde, ultimaSolicitudDeAyuda } from '../datos/avisos.js'
import type { BaseDeDatos } from '../datos/conexion.js'
import { ahora } from '../datos/tiempo.js'
import type { RoomManager } from './room-manager.js'

const MAX_ALERTAS = 10

export interface SolicitudDeAyuda {
  agente: string
  estado: AgentStatus
  conversacion: string | null
  desde: number | null   // segundos Unix
}

export interface AlertaDuplicidad {
  id: number
  contacto: string | null
  agentes: string[]
  cuando: number         // segundos Unix
}

export class Avisos {
  constructor(
    private readonly base: BaseDeDatos,
    private readonly sala: RoomManager
  ) {}

  ayuda(): SolicitudDeAyuda[] {
    return this.sala
      .getAllAgents()
      .filter((agente) => agente.requesting)
      .map((agente) => ({
        agente: agente.name,
        estado: agente.status,
        conversacion: agente.contact,
        desde: ultimaSolicitudDeAyuda(this.base, agente.name)
      }))
      .sort((a, b) => (a.desde ?? 0) - (b.desde ?? 0)) // quien lleva más tiempo esperando, primero
  }

  // Sin `desde` válido: las de las últimas 24 horas.
  duplicidades(desde: number | null): AlertaDuplicidad[] {
    const inicio = desde !== null && Number.isFinite(desde) ? desde : ahora() - 24 * 60 * 60
    return duplicidadesDesde(this.base, inicio, MAX_ALERTAS).map((fila) => ({
      id: fila.id,
      contacto: fila.contacto,
      agentes: fila.agentes ? fila.agentes.split(', ') : [],
      cuando: fila.cuando
    }))
  }
}
