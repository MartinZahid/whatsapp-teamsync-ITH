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
//     5. Duplicidad (RN-07): cuando DOS agentes ESCRIBEN en el mismo chat
//        -> registrarEscritura() + alertDuplicate()
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
  // En qué chat ya ESCRIBIÓ cada agente (nombre normalizado). Se borra al
  // cambiar de chat o de estado. Sirve para la duplicidad (RN-07).
  private escribioEn = new Map<string, string>()
  // Id del navegador (`client`) de la conexión actual de cada agente.
  private clientes = new Map<string, string>()

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
  // ¿El agente ya está en uso en OTRO navegador que sigue activo?
  // Regla: gana el que ya está conectado. Pero NUNCA queda atrapado: se libera
  // si su conexión se cerró, si ya está Desconectado o si lleva más de 60 s
  // sin dar señal (heartbeat). El mismo navegador siempre puede reconectarse.
  agenteOcupado(name: string, client?: string): boolean {
    const agent = this.getAllAgents().find((a) => a.name === name)
    if (!agent) return false
    const ws = this.connections.get(agent.id)
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (agent.status === 'offline') return false
    if (Date.now() - agent.lastSeen > HEARTBEAT_TIMEOUT_MS) return false
    const actual = this.clientes.get(agent.id)
    if (client && actual === client) return false // es el mismo navegador
    return true
  }

  register(ws: WebSocket, name: string, client?: string): string | null {
    const existing = this.getAllAgents().find((a) => a.name === name) ?? this.cargarDeLaBase(name)
    if (!existing && this.restringido) {
      console.log(`[Servidor] Rechazado: "${name}" no está dado de alta`)
      return null
    }

    if (existing) {
      const previous = this.connections.get(existing.id)
      if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
        // Llegó una conexión nueva que SÍ puede quedarse con el agente (es el
        // mismo navegador que se reconecta, o la vieja ya no daba señal; ver
        // agenteOcupado). Avisamos a la vieja para que NO intente reconectarse.
        this.send(previous, {
          type: 'ERROR',
          code: 'REPLACED',
          message: 'Este agente se volvió a conectar en otra conexión'
        })
        previous.close()
      }
      this.connections.set(existing.id, ws)
      this.guardarCliente(existing.id, client)
      existing.lastSeen = Date.now()
      console.log(`[Servidor] Agente conectado: ${name}`)
      this.bitacora.agenteConectado(existing)
      return existing.id
    }

    const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.connections.set(id, ws)
    this.guardarCliente(id, client)
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

  private guardarCliente(agentId: string, client?: string): void {
    if (client) this.clientes.set(agentId, client)
    else this.clientes.delete(agentId)
  }

  // Cambia el estado de un agente y lleva el cronómetro de atención
  // (`attendingSince`): arranca al empezar a atender un chat y se limpia al salir.
  private setStatus(agent: Agent, status: AgentStatus, contact: string | null = null, reason?: string): void {
    const before = agent.status
    const contactBefore = agent.contact
    const sameChat = agent.status === 'attending' && status === 'attending' && agent.contact === contact
    // Si deja el chat (o cambia a otro), ya no cuenta que haya escrito en él.
    if (!sameChat) this.escribioEn.delete(agent.id)
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
        // Abrir un chat ya NO es duplicidad: solo cuenta al escribir (WRITING).
        if (!sameChat) console.log(`[Servidor] ${agent.name} atiende: ${message.contact}`)
        return
      }
      case 'WRITING':
        // Solo la primera vez que escribe en este chat se revisa la duplicidad.
        if (this.registrarEscritura(agent, message.contact)) this.alertDuplicate(agent)
        return
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
    this.escribioEn.delete(agent.id)
    this.clientes.delete(agent.id)
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

  // Marca que el agente escribió en el chat que tiene abierto. Devuelve true
  // solo la PRIMERA vez por chat (para no repetir la alerta en cada mensaje).
  private registrarEscritura(agent: Agent, contact: unknown): boolean {
    if (typeof contact !== 'string' || agent.status !== 'attending' || !agent.contact) return false
    const key = normalizeContact(agent.contact)
    // Debe ser el chat que el servidor sabe que tiene abierto.
    if (!key || normalizeContact(contact) !== key) return false
    if (this.escribioEn.get(agent.id) === key) return false
    this.escribioEn.set(agent.id, key)
    return true
  }

  // Los OTROS agentes que tienen abierto el mismo chat y ya escribieron en él.
  private otrosQueEscribieron(agent: Agent): Agent[] {
    const key = this.escribioEn.get(agent.id)
    if (!key) return []
    return this.getAllAgents().filter(
      (other) =>
        other.id !== agent.id &&
        other.status === 'attending' &&
        this.escribioEn.get(other.id) === key
    )
  }

  // RN-07: dos o más agentes ESCRIBIERON en el mismo chat. Avisa SOLO a ellos.
  private alertDuplicate(agent: Agent): void {
    const others = this.otrosQueEscribieron(agent)
    if (others.length === 0 || !agent.contact) return

    const involucrados = [agent, ...others]
    const alert: DuplicateAlertMessage = {
      type: 'DUPLICATE_ALERT',
      contact: agent.contact,
      agents: involucrados.map((a) => ({ id: a.id, name: a.name })),
      at: Date.now()
    }
    console.log(
      `[Servidor] Atención duplicada en "${agent.contact}": ${alert.agents.map((a) => a.name).join(', ')}`
    )
    this.bitacora.duplicidad(involucrados)
    for (const a of involucrados) this.sendTo(a.id, alert)
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

  // Envía un mensaje a UN agente (si está conectado).
  private sendTo(agentId: string, message: ServerToClientMessage): void {
    const ws = this.connections.get(agentId)
    if (ws) this.send(ws, message)
  }

  private sendToAll(message: ServerToClientMessage): void {
    for (const ws of this.connections.values()) this.send(ws, message)
  }

  private send(ws: WebSocket, message: ServerToClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
  }
}