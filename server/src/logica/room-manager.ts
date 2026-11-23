// Gestión de la sala de presencia: registro de agentes y difusión del estado.
//
// GUÍA DE LECTURA — el corazón del servidor:
//   Este es el único archivo con una CLASE (`RoomManager`). La clase agrupa
//   datos (los Map de abajo) y las acciones que los modifican (métodos).
//   El servidor crea UNA instancia y la comparte entre todas las conexiones.
//
//   Flujo general:
//     1. Un cliente se conecta y se identifica  -> register()
//     2. Envía mensajes (atiende, pausa, etc.)  -> handleMessage()
//     3. Al cerrar la pestaña                   -> disconnect()
//     4. Si deja de dar señal (heartbeat)       -> checkHeartbeats()
//   Cada cambio termina llamando a broadcastPresence(), que reenvía la lista
//   completa de agentes a TODOS los conectados.

import { WebSocket } from 'ws'
import {
  Agent,
  AgentStatus,
  ClientToServerMessage,
  DuplicateAlertMessage,
  ServerToClientMessage,
  normalizeContact
} from '../../../shared/types.js'
import { APP_VERSION } from '../../../shared/version.js'
import { BitacoraNula, type Bitacora } from '../datos/bitacora.js'

// Tiempo sin señal tras el cual un agente se considera desconectado (RN-04).
const HEARTBEAT_TIMEOUT_MS = 60000

// `Map<clave, valor>` = diccionario: busca por clave en tiempo constante.
// Aquí la clave es el id interno del agente.
export class RoomManager {
  // Agentes registrados, indexados por su id interno.
  // `private` = estos datos solo se usan dentro de la clase.
  private agents = new Map<string, Agent>()
  // Conexión WebSocket de cada agente, indexada por su id interno.
  private connections = new Map<string, WebSocket>()

  // La bitácora se recibe desde fuera (server.ts). Si no se da, no se guarda nada.
  // Si hay base, solo pueden conectarse los agentes dados de alta en ella.
  private readonly restringido: boolean

  constructor(private readonly bitacora: Bitacora = new BitacoraNula()) {
    // Al arrancar se cargan los agentes de la base como Desconectados, así la
    // lista de presencia muestra a TODO el equipo aunque nadie se haya conectado.
    const registrados = bitacora.agentesRegistrados()
    this.restringido = registrados !== null
    for (const { agentId, name } of registrados ?? []) {
      this.agents.set(agentId, {
        id: agentId,
        name,
        status: 'offline',
        contact: null,
        lastSeen: 0,
        requesting: false,
        attendingSince: null
      })
    }
    if (registrados) console.log(`[Servidor] ${registrados.length} agentes cargados de la base`)
  }

  // Registra una conexión y devuelve el id del agente. Si ya existe un agente
  // con el mismo nombre, reutiliza su registro (reconexión) para que conserve
  // su identidad. No difunde nada: el mensaje que identificó al agente se
  // procesa justo después con handleMessage() y ese ya difunde el estado real.
  // Devuelve null si hay base y el nombre no está dado de alta.
  register(ws: WebSocket, name: string): string | null {
    const existing = this.getAllAgents().find((a) => a.name === name) ?? this.cargarDeLaBase(name)
    if (!existing && this.restringido) {
      console.log(`[Servidor] Rechazado: "${name}" no está dado de alta`)
      return null
    }

    if (existing) {
      const previous = this.connections.get(existing.id)
      if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
        // El mismo nombre entró desde otro navegador. Avisamos a la conexión
        // vieja para que NO intente reconectarse (si no, se tumban en bucle).
        this.send(previous, {
          type: 'ERROR',
          code: 'REPLACED',
          message: 'Este agente se conectó desde otro navegador'
        })
        previous.close()
      }
      this.connections.set(existing.id, ws)
      existing.lastSeen = Date.now()
      console.log(`[Servidor] Agente conectado: ${name}`)
      this.bitacora.agenteConectado(existing)
      return existing.id
    }

    const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.connections.set(id, ws)
    const agent: Agent = {
      id,
      name,
      status: 'available',
      contact: null,
      lastSeen: Date.now(),
      requesting: false,
      attendingSince: null
    }
    this.agents.set(id, agent)
    console.log(`[Servidor] Agente registrado: ${name}`)
    this.bitacora.agenteConectado(agent)
    return id
  }

  // Cambia el estado de un agente y lleva el cronómetro de atención
  // (`attendingSince`): arranca al empezar a atender un chat y se limpia al salir.
  private setStatus(agent: Agent, status: AgentStatus, contact: string | null = null, reason?: string): void {
    const before = agent.status
    const contactBefore = agent.contact
    const sameChat = agent.status === 'attending' && status === 'attending' && agent.contact === contact
    agent.status = status
    agent.contact = contact
    if (status !== 'attending') agent.attendingSince = null
    else if (!sameChat || agent.attendingSince === null) agent.attendingSince = Date.now()
    this.bitacora.cambioDeEstado(agent, before, contactBefore, reason)
  }

  // Pasa a Desconectado. Una ayuda pendiente no sobrevive a una desconexión.
  // La bitácora registra `disconnected` con el motivo.
  private goOffline(agent: Agent, reason: string): void {
    this.setStatus(agent, 'offline', null, reason)
    agent.requesting = false
    console.log(`[Servidor] ${agent.name} desconectado (${reason})`)
  }

  // Procesa un mensaje del agente y actualiza su estado.
  handleMessage(agentId: string, message: ClientToServerMessage): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    // Cualquier mensaje cuenta como señal de actividad.
    agent.lastSeen = Date.now()

    // `switch` sobre `type`: en cada caso TypeScript ya sabe qué campos trae.
    switch (message.type) {
      case 'ATTENDING': {
        // Sin nombre de contacto no hay chat que atender: se ignora el mensaje.
        if (typeof message.contact !== 'string' || !message.contact.trim()) return
        const sameChat = agent.status === 'attending' && agent.contact === message.contact
        this.setStatus(agent, 'attending', message.contact)
        this.broadcastPresence()
        // Solo revisamos duplicidad si de verdad empezó un chat nuevo; si es
        // el mismo (reenvío tras reconexión) la alerta ya se dio en su momento.
        if (!sameChat) {
          console.log(`[Servidor] ${agent.name} atiende: ${message.contact}`)
          this.alertDuplicate(agent)
        }
        return
      }
      case 'AVAILABLE':
        this.setStatus(agent, 'available')
        console.log(`[Servidor] ${agent.name} disponible`)
        break
      case 'PAUSED':
        this.setStatus(agent, 'paused')
        console.log(`[Servidor] ${agent.name} en pausa`)
        break
      case 'OFFLINE':
        this.goOffline(agent, 'manual')
        break
      case 'HELP_REQUEST':
        // Solicita o cancela ayuda SIN tocar el estado.
        if (agent.requesting !== message.requesting) this.bitacora.ayuda(agent, message.requesting)
        agent.requesting = message.requesting
        console.log(
          `[Servidor] ${agent.name} ${message.requesting ? 'solicita ayuda' : 'cancela la solicitud de ayuda'}`
        )
        break
      default:
        // HEARTBEAT (u otro) solo actualiza la actividad.
        return
    }

    this.broadcastPresence()
  }

  // Busca en la base un agente que se dio de alta después de arrancar el
  // servidor (p. ej. desde el dashboard) y lo agrega a la sala como Desconectado.
  private cargarDeLaBase(name: string): Agent | undefined {
    if (!this.restringido) return undefined
    const fila = this.bitacora.agentesRegistrados()?.find((a) => a.name === name)
    if (!fila) return undefined
    const agent: Agent = {
      id: fila.agentId,
      name,
      status: 'offline',
      contact: null,
      lastSeen: 0,
      requesting: false,
      attendingSince: null
    }
    this.agents.set(agent.id, agent)
    return agent
  }

  // Baja de un agente (ADR-001: la pide el dashboard, NO la extensión).
  // Cierra su conexión si estaba conectado y lo quita de la presencia.
  darDeBaja(name: string): boolean {
    const agent = this.getAllAgents().find((a) => a.name === name)
    if (!agent) return false
    const ws = this.connections.get(agent.id)
    this.connections.delete(agent.id)
    if (agent.status !== 'offline') this.goOffline(agent, 'baja del agente')
    this.bitacora.bajaAgente(agent)
    this.agents.delete(agent.id)
    ws?.close()
    console.log(`[Servidor] Agente dado de baja: ${agent.name}`)
    this.broadcastPresence()
    return true
  }

  // Al detener el servidor: deja a todos Desconectados para que la bitácora
  // cierre las sesiones abiertas con la hora real (si no, quedan 'open').
  apagar(): void {
    for (const agent of this.agents.values()) {
      if (agent.status !== 'offline') this.goOffline(agent, 'servidor detenido')
    }
  }

  // RN-07: avisa a todos si otro agente ya atiende el mismo contacto.
  private alertDuplicate(agent: Agent): void {
    if (!agent.contact) return
    const key = normalizeContact(agent.contact)
    if (!key) return

    const others = this.getAllAgents().filter(
      (other) =>
        other.id !== agent.id &&
        other.status === 'attending' &&
        other.contact !== null &&
        normalizeContact(other.contact) === key
    )
    if (others.length === 0) return

    const alert: DuplicateAlertMessage = {
      type: 'DUPLICATE_ALERT',
      contact: agent.contact,
      agents: [agent, ...others].map((a) => ({ id: a.id, name: a.name })),
      at: Date.now()
    }
    console.log(
      `[Servidor] Atención duplicada en "${agent.contact}": ${alert.agents.map((a) => a.name).join(', ')}`
    )
    this.bitacora.duplicidad([agent, ...others])
    this.sendToAll(alert)
  }

  // Marca al agente como desconectado cuando se cierra SU conexión actual.
  disconnect(agentId: string, ws: WebSocket): void {
    // Si ya hay otra conexión (reconexión o reemplazo), esta no cuenta.
    if (this.connections.get(agentId) !== ws) return

    this.connections.delete(agentId)
    const agent = this.agents.get(agentId)
    if (agent && agent.status !== 'offline') {
      this.goOffline(agent, 'conexión cerrada')
      agent.lastSeen = Date.now()
      this.broadcastPresence()
    }
  }

  // Marca como desconectados a los agentes que llevan mucho tiempo sin dar señal.
  // Si después vuelve a llegar un heartbeat, la extensión nota la diferencia en
  // la presencia y reenvía su estado (ver service-worker.ts).
  checkHeartbeats(): void {
    const now = Date.now()
    let changed = false
    for (const agent of this.agents.values()) {
      if (agent.status !== 'offline' && now - agent.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        this.goOffline(agent, 'sin heartbeat')
        changed = true
      }
    }
    if (changed) this.broadcastPresence()
  }

  // Lista de agentes para enviar al cliente.
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  // Envía la versión y la lista de agentes al agente que acaba de entrar.
  sendInitialState(agentId: string): void {
    const ws = this.connections.get(agentId)
    if (ws) this.send(ws, { type: 'SERVER_INFO', version: APP_VERSION, agents: this.getAllAgents() })
  }

  // Envía la lista completa de agentes a todos los conectados.
  private broadcastPresence(): void {
    this.sendToAll({ type: 'PRESENCE_UPDATE', agents: this.getAllAgents() })
  }

  private sendToAll(message: ServerToClientMessage): void {
    for (const ws of this.connections.values()) this.send(ws, message)
  }

  private send(ws: WebSocket, message: ServerToClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
  }
}