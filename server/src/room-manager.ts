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
  DuplicateAlertMessage,
  PresenceUpdate,
  ServerToClientMessage,
  WSMessage,
  STATUS_COLORS,
  isAttendingMessage,
  isPausedMessage,
  isAvailableMessage,
  isOfflineMessage,
  isDeleteAgentMessage,
  isHelpRequestMessage
} from '../../shared/types.js'
import { APP_VERSION } from '../../shared/version.js'

// Tiempo sin señal tras el cual un agente se considera desconectado.
const HEARTBEAT_TIMEOUT_MS = 60000

// Empareja el agente (por id) con su conexión WebSocket.
interface ClientConnection {
  ws: WebSocket
  agentName: string
  agentId: string
}

// `Map<clave, valor>` = diccionario: busca por clave en tiempo constante.
// Aquí la clave es el id interno del agente.
export class RoomManager {
  // Agentes registrados, indexados por su id interno.
  // `private` = estos datos solo se usan dentro de la clase (nadie los toca desde fuera).
  private agents = new Map<string, Agent>()
  // Conexión de cada agente, indexada por su id interno.
  private connections = new Map<string, ClientConnection>()

  // Genera un id interno único a partir del nombre del agente.
  private generateAgentId(name: string): string {
    return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  // Registra una conexión. Si ya existe un agente con el mismo nombre,
  // reutiliza su registro para que conserve su identidad al reconectarse.
  register(ws: WebSocket, name: string): string {
    const existing = Array.from(this.agents.values()).find((a) => a.name === name)

    if (existing) {
      const previous = this.connections.get(existing.id)
      this.connections.set(existing.id, { ws, agentName: name, agentId: existing.id })
      if (previous && previous.ws !== ws) {
        try { previous.ws.close() } catch { /* la conexión vieja ya no importa */ }
      }
      this.setStatus(existing, 'available')
      existing.lastSeen = Date.now()
      // La solicitud de ayuda se conserva en la reconexión; se limpia al
      // desconectarse o cuando el agente la cancela con HELP_REQUEST.
      this.broadcastPresence()
      console.log(`[Servidor] Agente reconectado: ${name}`)
      return existing.id
    }

    const agentId = this.generateAgentId(name)
    this.connections.set(agentId, { ws, agentName: name, agentId })
    this.agents.set(agentId, {
      id: agentId,
      name,
      status: 'available',
      contact: null,
      color: STATUS_COLORS.available,
      lastSeen: Date.now(),
      requesting: false
    })
    this.broadcastPresence()
    console.log(`[Servidor] Agente registrado: ${name}`)
    return agentId
  }

  // Cambia el estado de un agente y ajusta su color.
  private setStatus(agent: Agent, status: AgentStatus, contact: string | null = null): void {
    agent.status = status
    agent.contact = contact
    agent.color = STATUS_COLORS[status]
  }

  // Procesa un mensaje del agente y actualiza su estado.
  handleMessage(agentId: string, message: WSMessage): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    // Cualquier mensaje cuenta como señal de actividad.
    agent.lastSeen = Date.now()

    // Contacto que el agente acaba de empezar a atender. Se revisa al final,
    // después de difundir la presencia, para detectar duplicidad (RN-07).
    let duplicateContact: string | null = null

    // Cada `isXMessage` viene de shared/types.ts. Al dar true, TypeScript ya
    // sabe el tipo exacto del mensaje (y por eso `message.contact` es válido).
    if (isAttendingMessage(message)) {
      this.setStatus(agent, 'active', message.contact)
      duplicateContact = message.contact
      console.log(`[Servidor] ${agent.name} atiende: ${message.contact}`)
    } else if (isPausedMessage(message)) {
      this.setStatus(agent, 'paused')
      console.log(`[Servidor] ${agent.name} en pausa`)
    } else if (isAvailableMessage(message)) {
      this.setStatus(agent, 'available')
      console.log(`[Servidor] ${agent.name} disponible`)
    } else if (isOfflineMessage(message)) {
      this.setStatus(agent, 'offline')
      // Una ayuda pendiente no sobrevive a una desconexión.
      agent.requesting = false
      console.log(`[Servidor] ${agent.name} desconectado`)
    } else if (isHelpRequestMessage(message)) {
      // Solicita o cancela ayuda SIN tocar el estado ni el color.
      agent.requesting = message.requesting
      console.log(
        `[Servidor] ${agent.name} ${message.requesting ? 'solicita ayuda' : 'cancela la solicitud de ayuda'}`
      )
    } else if (isDeleteAgentMessage(message)) {
      this.agents.delete(agentId)
      this.connections.delete(agentId)
      console.log(`[Servidor] Agente eliminado: ${agent.name}`)
    } else {
      // Otros mensajes (por ejemplo HEARTBEAT) solo actualizan la actividad.
      return
    }

    this.broadcastPresence()

    // Ya con la presencia actualizada, avisamos si hay duplicidad.
    if (duplicateContact !== null) this.alertDuplicate(agent, duplicateContact)
  }

  // Normaliza un contacto para compararlo aunque cambien mayúsculas o espacios.
  private normalizeContact(contact: string): string {
    return contact.trim().replace(/\s+/g, ' ').toLowerCase()
  }

  // RN-07: avisa a todos si otro agente ya atiende el mismo contacto.
  private alertDuplicate(agent: Agent, contact: string): void {
    const key = this.normalizeContact(contact)
    if (!key) return

    const others = this.getAllAgents().filter(
      (other) =>
        other.id !== agent.id &&
        other.status === 'active' &&
        other.contact !== null &&
        this.normalizeContact(other.contact) === key
    )
    if (others.length === 0) return

    const alert: DuplicateAlertMessage = {
      type: 'DUPLICATE_ALERT',
      contact,
      agents: [agent, ...others].map((a) => ({ id: a.id, name: a.name })),
      at: Date.now()
    }
    console.log(
      `[Servidor] Atención duplicada en "${contact}": ${alert.agents.map((a) => a.name).join(', ')}`
    )
    this.sendToAll(alert)
  }

  // Marca al agente como desconectado cuando se cierra su conexión.
  disconnect(agentId: string): void {
    const conn = this.connections.get(agentId)
    // Si ya hay una conexión nueva activa (reconexión), no lo marcamos desconectado.
    if (conn && conn.ws.readyState === WebSocket.OPEN) return

    this.connections.delete(agentId)
    const agent = this.agents.get(agentId)
    if (agent && agent.status !== 'offline') {
      this.setStatus(agent, 'offline')
      // Una ayuda pendiente no sobrevive a una desconexión real.
      agent.requesting = false
      agent.lastSeen = Date.now()
      this.broadcastPresence()
      console.log(`[Servidor] Agente desconectado: ${agent.name}`)
    }
  }

  // Marca como desconectados a los agentes que llevan mucho tiempo sin dar señal.
  checkHeartbeats(): void {
    const now = Date.now()
    let changed = false
    for (const agent of this.agents.values()) {
      if (agent.status !== 'offline' && now - agent.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        this.setStatus(agent, 'offline')
        // Si dejó de dar señal, su solicitud de ayuda ya no es válida.
        agent.requesting = false
        changed = true
        console.log(`[Servidor] Sin heartbeat de ${agent.name}: marcado como desconectado`)
      }
    }
    if (changed) this.broadcastPresence()
  }

  // Lista de agentes para enviar al cliente.
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  // Envía la lista completa de agentes a todos los conectados.
  private broadcastPresence(): void {
    const message: PresenceUpdate = { type: 'PRESENCE_UPDATE', agents: this.getAllAgents() }
    this.sendToAll(message)
  }

  // Envía un mensaje a todas las conexiones abiertas.
  private sendToAll(message: ServerToClientMessage): void {
    const data = JSON.stringify(message)
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(data)
    }
  }

  // Envía el estado inicial (versión + agentes) al agente que acaba de entrar.
  sendInitialState(agentId: string): void {
    const conn = this.connections.get(agentId)
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return
    conn.ws.send(JSON.stringify({
      type: 'SERVER_INFO',
      version: APP_VERSION,
      agents: this.getAllAgents()
    }))
  }
}
