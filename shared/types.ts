// Tipos compartidos entre la extensión y el servidor.
// Son la fuente única de verdad del protocolo WebSocket.
//
// GUÍA DE LECTURA — conceptos de TypeScript que verás en este archivo:
//   - `type`  define un alias. Aquí se usa para listar valores permitidos
//             (una "unión"), p. ej. un estado solo puede ser uno de los cuatro.
//   - `interface` describe la forma de un objeto (qué campos tiene y de qué tipo).
//   - Los tipos NO existen cuando el programa corre: sirven en el editor y al
//             compilar, para que no te equivoques escribiendo el código.
//   - `isAlgoMessage(...)` es un "validador de tipo": recibe un mensaje genérico
//             y le dice a TypeScript cuál es exactamente, según su campo `type`.

// Estados posibles de un agente.
// `type` + `|` = unión: el valor debe ser UNA de estas cadenas de texto.
export type AgentStatus = 'active' | 'paused' | 'available' | 'offline'

// Información de un agente tal como la ve el resto del equipo.
export interface Agent {
  id: string           // id interno que genera el servidor
  name: string         // nombre con el que el agente se identifica
  status: AgentStatus  // uno de los cuatro estados de arriba
  contact: string | null // chat que atiende; `| null` = puede venir vacío
  color: string        // color asociado al estado (para el panel/dashboard)
  lastSeen: number     // última señal de actividad, en milisegundos (Date.now())
  requesting: boolean  // true = pidió ayuda; es independiente de su estado
  activeSince: number | null // inicio de la atención actual; null si no atiende
}

// --- Mensajes del cliente (extensión) hacia el servidor ---
//
// Cada mensaje tiene un campo `type` que lo distingue y el nombre del agente.
// El servidor mira ese `type` para saber qué hacer (ver room-manager.ts).
//
// Nota didáctica: los mensajes viajan como TEXTO (JSON). Los objetos de abajo
// son solo la forma que ese texto tiene una vez convertido con JSON.parse.

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

// Solicitud de ayuda (RN-03). `requesting` en true la activa y en false la
// cancela. No cambia el estado del agente: es un aviso independiente.
export interface HelpRequestMessage {
  type: 'HELP_REQUEST'
  agent: string
  requesting: boolean
}

export type ClientToServerMessage =
  | AttendingMessage
  | PausedMessage
  | AvailableMessage
  | OfflineMessage
  | DeleteAgentMessage
  | HeartbeatMessage
  | HelpRequestMessage

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

// Alerta de duplicidad (RN-07). El servidor la envía a todos cuando detecta
// que dos o más agentes atienden el mismo contacto al mismo tiempo.
export interface DuplicateAlertMessage {
  type: 'DUPLICATE_ALERT'
  contact: string
  agents: Array<{ id: string; name: string }>
  at: number
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
  | DuplicateAlertMessage
  | ErrorMessage

// Cualquier mensaje que viaja por el socket (de ida o de vuelta).
export type WSMessage = ClientToServerMessage | ServerToClientMessage

// --- Validadores de tipo (permiten estrechar el tipo en el servidor) ---
//
// Reciben un `WSMessage` y devuelven true/false. Cuando dan true, TypeScript ya
// sabe el tipo exacto y deja acceder a sus campos con seguridad (p. ej. contact).

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

export function isHelpRequestMessage(msg: WSMessage): msg is HelpRequestMessage {
  return msg.type === 'HELP_REQUEST'
}

export function isDuplicateAlertMessage(msg: WSMessage): msg is DuplicateAlertMessage {
  return msg.type === 'DUPLICATE_ALERT'
}

// --- Colores y etiquetas de cada estado ---
//
// `Record<AgentStatus, string>` = un objeto que tiene una entrada por cada
// estado posible. Si mañana agregas un estado, TypeScript te obligará a
// darle aquí su color y su etiqueta (no se te puede olvidar ninguno).

export const STATUS_COLORS: Record<AgentStatus, string> = {
  active: '#ef4444',   // rojo    - Atendiendo
  paused: '#f59e0b',   // amarillo - Pausado
  available: '#22c55e', // verde   - Disponible
  offline: '#9ca3af'   // gris    - Desconectado
}

export const STATUS_LABELS: Record<AgentStatus, string> = {
  active: 'Atendiendo',
  paused: 'Pausado',
  available: 'Disponible',
  offline: 'Desconectado'
}
