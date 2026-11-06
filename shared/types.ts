// Tipos compartidos entre la extensión y el servidor.
// Son la fuente única de verdad del protocolo WebSocket.
//
// GUÍA DE LECTURA — conceptos de TypeScript que verás en este archivo:
//   - `type`  define un alias. Aquí se usa para listar valores permitidos
//             (una "unión"), p. ej. un estado solo puede ser uno de los cuatro.
//   - `interface` describe la forma de un objeto (qué campos tiene y de qué tipo).
//   - Los tipos NO existen cuando el programa corre: sirven en el editor y al
//             compilar, para que no te equivoques escribiendo el código.
//   - Todos los mensajes tienen un campo `type`. Al hacer `switch (msg.type)`,
//             TypeScript ya sabe qué campos tiene cada caso (unión discriminada),
//             así que no hacen falta funciones validadoras aparte.

// Estados posibles de un agente (RN-01 a RN-04).
// `type` + `|` = unión: el valor debe ser UNA de estas cadenas de texto.
export type AgentStatus = 'attending' | 'available' | 'paused' | 'offline'

// Información de un agente tal como la ve el resto del equipo.
export interface Agent {
  id: string           // id interno que genera el servidor
  name: string         // nombre con el que el agente se identifica
  status: AgentStatus  // uno de los cuatro estados de arriba
  contact: string | null // chat que atiende; `| null` = puede venir vacío
  lastSeen: number     // última señal de actividad, en milisegundos (Date.now())
  requesting: boolean  // true = pidió ayuda; es independiente de su estado
  attendingSince: number | null // inicio de la atención actual; null si no atiende
}

// --- Mensajes del cliente (extensión) hacia el servidor ---
//
// Cada mensaje lleva su `type` y el nombre del agente. El primer mensaje de
// una conexión, sea cual sea, sirve también para identificar al agente.
//
// Nota didáctica: los mensajes viajan como TEXTO (JSON). Los objetos de abajo
// son solo la forma que ese texto tiene una vez convertido con JSON.parse.

export type ClientToServerMessage =
  | { type: 'ATTENDING'; agent: string; contact: string }
  | { type: 'AVAILABLE'; agent: string }
  | { type: 'PAUSED'; agent: string; reason?: string }
  | { type: 'OFFLINE'; agent: string }
  | { type: 'DELETE_AGENT'; agent: string }
  | { type: 'HEARTBEAT'; agent: string }
  // Solicitud de ayuda (RN-03): no cambia el estado, es un aviso independiente.
  | { type: 'HELP_REQUEST'; agent: string; requesting: boolean }

// --- Mensajes del servidor hacia el cliente (extensión) ---

// Alerta de duplicidad (RN-07): dos o más agentes atienden el mismo contacto.
export interface DuplicateAlertMessage {
  type: 'DUPLICATE_ALERT'
  contact: string
  agents: Array<{ id: string; name: string }>
  at: number
}

// Códigos de error que puede enviar el servidor.
//   PARSE_ERROR   el texto recibido no es JSON válido
//   AUTH_REQUIRED el primer mensaje no traía el nombre del agente
//   REPLACED      el mismo agente se conectó desde otro navegador
export type ErrorCode = 'PARSE_ERROR' | 'AUTH_REQUIRED' | 'REPLACED'

export type ServerToClientMessage =
  | { type: 'WELCOME'; message: string; protocol: string }
  | { type: 'SERVER_INFO'; version: string; agents: Agent[] }
  | { type: 'PRESENCE_UPDATE'; agents: Agent[] }
  | DuplicateAlertMessage
  | { type: 'ERROR'; code: ErrorCode; message: string }

// --- Utilidades compartidas ---

// Normaliza el nombre de un contacto para compararlo (y guardarlo en la base):
// quita espacios al inicio/fin, junta espacios repetidos y pasa a minúsculas.
export function normalizeContact(contact: string): string {
  return contact.trim().replace(/\s+/g, ' ').toLowerCase()
}

// --- Colores y etiquetas de cada estado ---
//
// `Record<AgentStatus, string>` = un objeto que tiene una entrada por cada
// estado posible. Si mañana agregas un estado, TypeScript te obligará a
// darle aquí su color y su etiqueta (no se te puede olvidar ninguno).

export const STATUS_COLORS: Record<AgentStatus, string> = {
  attending: '#ef4444', // rojo     - Atendiendo
  available: '#22c55e', // verde    - Disponible
  paused: '#f59e0b',    // amarillo - Pausado
  offline: '#9ca3af'    // gris     - Desconectado
}

export const STATUS_LABELS: Record<AgentStatus, string> = {
  attending: 'Atendiendo',
  available: 'Disponible',
  paused: 'Pausado',
  offline: 'Desconectado'
}
