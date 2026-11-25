import type { Agent, AgentStatus, ChatDecision } from '@shared/types'
import type { AgentConfig, ConnectionState } from './storage'

// Estado completo que el service worker comparte con el popup y el panel.
export interface AppState {
  connection: ConnectionState
  agents: Agent[]
  config: AgentConfig
  status: AgentStatus
  requesting: boolean
}

// Mensajes que envían las interfaces (popup, opciones y panel) al service worker.
export type UiRequest =
  | { type: 'GET_STATE' }
  | { type: 'SET_CONFIG'; config: AgentConfig }
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'SET_STATUS'; status: AgentStatus }
  | { type: 'SET_HELP'; requesting: boolean }
  | { type: 'CONTACT_CHANGED'; contact: string | null }
  // El agente escribió en la caja de mensaje del chat abierto (RN-07).
  | { type: 'WRITING' }
  // Botones del aviso de duplicidad: tomar o ceder el chat.
  | { type: 'CHAT_DECISION'; contact: string; decision: ChatDecision }

// Mensajes que el service worker difunde a las interfaces.
export type SwEvent =
  | { type: 'STATE'; state: AppState }
  | { type: 'DUPLICATE'; contact: string; agents: Array<{ id: string; name: string }> }
  // Otro agente del aviso tomó o cedió el chat.
  | { type: 'CHAT_DECISION'; contact: string; agent: string; decision: ChatDecision }
