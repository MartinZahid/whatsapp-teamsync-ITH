// Gestión de la sala de presencia: registro de agentes y difusión del estado.

import { WebSocket } from 'ws'
import { Agent, AgentStatus, PresenceUpdate, STATUS_COLORS } from '../../shared/types.js'
import { APP_VERSION } from '../../shared/version.js'

interface ClientConnection {
  ws: WebSocket
  agentName: string
  agentId: string
}

export class RoomManager {
  // Agentes registrados, indexados por su id interno.
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
      lastSeen: Date.now()
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

  // Lista de agentes para enviar al cliente.
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  // Envía la lista completa de agentes a todos los conectados.
  private broadcastPresence(): void {
    const message: PresenceUpdate = { type: 'PRESENCE_UPDATE', agents: this.getAllAgents() }
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
