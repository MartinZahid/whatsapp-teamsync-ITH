// Tipos compartidos entre la extensión y el servidor.
// Son la fuente única de verdad del protocolo WebSocket.

// Estados posibles de un agente.
export type AgentStatus = 'active' | 'paused' | 'available' | 'offline'

// Información de un agente tal como la ve el resto del equipo.
export interface Agent {
  id: string
  name: string
  status: AgentStatus
  contact: string | null
  color: string
  lastSeen: number
}

// --- Mensajes del cliente (extensión) hacia el servidor ---

export interface AttendingMessage {
  type: 'ATTENDING'
  agent: string
  contact: string
  status: 'active'
}

export interface PausedMessage {
  type: 'PAUSED'
  agent: string
  reason?: string
}

export interface AvailableMessage {
  type: 'AVAILABLE'
  agent: string
}

export interface OfflineMessage {
  type: 'OFFLINE'
  agent: string
}

export interface DeleteAgentMessage {
  type: 'DELETE_AGENT'
  agent: string
}

export interface HeartbeatMessage {
  type: 'HEARTBEAT'
  agent: string
}

export type ClientToServerMessage =
  | AttendingMessage
  | PausedMessage
  | AvailableMessage
  | OfflineMessage
  | DeleteAgentMessage
  | HeartbeatMessage

// --- Mensajes del servidor hacia el cliente (extensión) ---

export interface WelcomeMessage {
  type: 'WELCOME'
  message: string
  protocol: string
}

export interface ServerInfoMessage {
  type: 'SERVER_INFO'
  version: string
  agents: Agent[]
}

export interface PresenceUpdate {
  type: 'PRESENCE_UPDATE'
  agents: Agent[]
}

export interface ErrorMessage {
  type: 'ERROR'
  code: string
  message: string
}

export type ServerToClientMessage =
  | WelcomeMessage
  | ServerInfoMessage
  | PresenceUpdate
  | ErrorMessage

// Cualquier mensaje que viaja por el socket.
export type WSMessage = ClientToServerMessage | ServerToClientMessage

// --- Validadores de tipo (permiten estrechar el tipo en el servidor) ---

export function isAttendingMessage(msg: WSMessage): msg is AttendingMessage {
  return msg.type === 'ATTENDING'
}

export function isPausedMessage(msg: WSMessage): msg is PausedMessage {
  return msg.type === 'PAUSED'
}

export function isAvailableMessage(msg: WSMessage): msg is AvailableMessage {
  return msg.type === 'AVAILABLE'
}

export function isOfflineMessage(msg: WSMessage): msg is OfflineMessage {
  return msg.type === 'OFFLINE'
}

export function isDeleteAgentMessage(msg: WSMessage): msg is DeleteAgentMessage {
  return msg.type === 'DELETE_AGENT'
}

export function isHeartbeatMessage(msg: WSMessage): msg is HeartbeatMessage {
  return msg.type === 'HEARTBEAT'
}

// --- Colores y etiquetas de cada estado ---

export const STATUS_COLORS: Record<AgentStatus, string> = {
  active: '#ef4444',
  paused: '#f59e0b',
  available: '#22c55e',
  offline: '#9ca3af'
}

export const STATUS_LABELS: Record<AgentStatus, string> = {
  active: 'Atendiendo',
  paused: 'Pausado',
  available: 'Disponible',
  offline: 'Desconectado'
}
