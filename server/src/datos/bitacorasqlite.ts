// CAPA 3 · DATOS — bitácora guardada en SQLite (RN-05, RN-06).
//
// GUÍA DE LECTURA — qué escribe cada llamada:
//   agenteConectado  -> events 'connected' + agent_status
//   cambioDeEstado   -> según el cambio:
//       empieza un chat          -> contacts + sessions (abre) + 'chat_start' (1)
//       deja el chat / cambia    -> sessions (cierra) + 'chat_end'
//       pausa                    -> 'paused' (3)
//       se desconecta            -> 'disconnected' (4), detail = motivo
//       vuelve a disponible      -> 'available' (2)
//     y siempre actualiza agent_status (la "foto" del estado actual).
//   ayuda            -> 'help_request' / 'help_cancel' (status_ref NULL)
//   duplicidad       -> 'duplicate_alert' (status_ref NULL) + una fila en
//                       event_participants por cada agente, con su sesión
//   bajaAgente       -> agents.active = 0
//
//   Cada llamada es UNA transacción. Si algo falla se avisa en consola y la
//   presencia en tiempo real sigue funcionando (la base nunca la detiene).

import type { Agent, AgentStatus } from '../../../shared/types.js'
import type { Bitacora } from './bitacora.js'
import type { BaseDeDatos } from './conexion.js'
import { buscarOCrearAgente, darDeBajaAgente } from './agentes.js'
import { registrarContacto } from './contactos.js'
import { ahora } from './tiempo.js'

// Ids fijos de la tabla `status` (ver esquema.sql).
const ID_ESTADO: Record<AgentStatus, number> = { attending: 1, available: 2, paused: 3, offline: 4 }

// Lo que se recuerda en memoria de cada agente para no consultar a cada rato.
interface Referencias {
  agente: number                                  // agents.id
  sesion: { id: number; contacto: number; inicio: number } | null // sesión abierta
}

export class BitacoraSqlite implements Bitacora {
  private refs = new Map<string, Referencias>() // clave: id interno del agente

  constructor(private readonly base: BaseDeDatos) {}

  agenteConectado(agente: Agent): void {
    this.seguro('connected', () => {
      const fila = buscarOCrearAgente(this.base, agente.name, agente.id)
      const previa = this.refs.get(agente.id)
      this.refs.set(agente.id, { agente: fila.id, sesion: previa?.sesion ?? null })
      this.evento(agente, 'connected', null, null)
      this.fotoEstado(agente)
    })
  }

  cambioDeEstado(agente: Agent, antes: AgentStatus, chatAntes: string | null, motivo?: string): void {
    const mismoChat = agente.status === antes && agente.contact === chatAntes
    if (mismoChat) return // p. ej. AVAILABLE repetido: no es un cambio

    this.seguro(agente.status, () => {
      const r = this.referencias(agente)
      const empiezaChat = agente.status === 'attending' && agente.contact !== null

      // 1) Si tenía un chat abierto y lo dejó (o cambió a otro), se cierra.
      if (r.sesion) {
        const sesion = this.cerrarSesion(r)
        // Si pasa a disponible, el chat_end ES el cambio de estado (status 2).
        // En los demás casos el cambio lo registra el evento siguiente.
        const estado = agente.status === 'available' ? 2 : null
        this.evento(agente, 'chat_end', estado, sesion.contacto, sesion.id)
      } else if (agente.status === 'available') {
        this.evento(agente, 'available', 2, null)
      }

      // 2) El nuevo estado.
      if (empiezaChat) {
        const contacto = registrarContacto(this.base, agente.contact!)
        this.abrirSesion(agente, r, contacto)
        this.evento(agente, 'chat_start', 1, contacto, r.sesion!.id)
      } else if (agente.status === 'paused') {
        this.evento(agente, 'paused', 3, null)
      } else if (agente.status === 'offline') {
        this.evento(agente, 'disconnected', 4, null, null, motivo ?? null)
      }

      this.fotoEstado(agente)
    })
  }

  ayuda(agente: Agent, solicita: boolean): void {
    this.seguro('help', () => {
      const r = this.referencias(agente)
      this.evento(agente, solicita ? 'help_request' : 'help_cancel', null, r.sesion?.contacto ?? null, r.sesion?.id ?? null)
    })
  }

  duplicidad(agentes: Agent[]): void {
    this.seguro('duplicate_alert', () => {
      const [quienLlega] = agentes
      const r = this.referencias(quienLlega)
      const nombres = agentes.map((a) => a.name).join(', ')
      const evento = this.evento(quienLlega, 'duplicate_alert', null, r.sesion?.contacto ?? null, r.sesion?.id ?? null, nombres)

      for (const agente of agentes) {
        const ra = this.referencias(agente)
        this.base.ejecutar(
          'INSERT INTO event_participants (event_ref, agent_ref, session_ref) VALUES (?, ?, ?)',
          [evento, ra.agente, ra.sesion?.id ?? null]
        )
      }
    })
  }

  bajaAgente(agente: Agent): void {
    this.seguro('baja', () => {
      const r = this.referencias(agente)
      if (r.sesion) {
        const sesion = this.cerrarSesion(r)
        this.evento(agente, 'chat_end', null, sesion.contacto, sesion.id)
      }
      darDeBajaAgente(this.base, r.agente)
      this.refs.delete(agente.id)
    })
  }

  // --- Ayudantes privados ---

  // Ejecuta en transacción y atrapa errores para no tumbar el servidor.
  private seguro(que: string, trabajo: () => void): void {
    try {
      this.base.transaccion(trabajo)
    } catch (err) {
      console.error(`[Datos] No se pudo registrar "${que}":`, err)
    }
  }

  private referencias(agente: Agent): Referencias {
    let r = this.refs.get(agente.id)
    if (!r) {
      // Por si llega un cambio antes de agenteConectado (no debería pasar).
      r = { agente: buscarOCrearAgente(this.base, agente.name, agente.id).id, sesion: null }
      this.refs.set(agente.id, r)
    }
    return r
  }

  private abrirSesion(agente: Agent, r: Referencias, contacto: number): void {
    const inicio = ahora()
    const { ultimoId } = this.base.ejecutar(
      `INSERT INTO sessions (agent_ref, agent_name, contact_ref, started_at, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [r.agente, agente.name, contacto, inicio]
    )
    r.sesion = { id: ultimoId, contacto, inicio }
  }

  // Cierra la sesión abierta y la devuelve (para ligar el chat_end).
  private cerrarSesion(r: Referencias): { id: number; contacto: number } {
    const sesion = r.sesion!
    const fin = ahora()
    this.base.ejecutar(
      `UPDATE sessions SET ended_at = ?, duration_seconds = ?, status = 'closed' WHERE id = ?`,
      [fin, fin - sesion.inicio, sesion.id]
    )
    r.sesion = null
    return sesion
  }

  private evento(
    agente: Agent,
    tipo: string,
    estado: number | null,
    contacto: number | null,
    sesion: number | null = null,
    detalle: string | null = null
  ): number {
    const r = this.referencias(agente)
    return this.base.ejecutar(
      `INSERT INTO events (session_ref, agent_ref, agent_name, type, status_ref, contact_ref, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sesion, r.agente, agente.name, tipo, estado, contacto, detalle, ahora()]
    ).ultimoId
  }

  // agent_status: una fila por agente que se sobrescribe (INSERT OR REPLACE).
  private fotoEstado(agente: Agent): void {
    const r = this.referencias(agente)
    this.base.ejecutar(
      `INSERT OR REPLACE INTO agent_status (agent_ref, status_ref, contact_ref, updated_at) VALUES (?, ?, ?, ?)`,
      [r.agente, ID_ESTADO[agente.status], r.sesion?.contacto ?? null, ahora()]
    )
  }
}