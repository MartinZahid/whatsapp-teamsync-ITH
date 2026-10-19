import type { Agent, AgentStatus } from '@shared/types'
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

// Mensajes que el service worker difunde a las interfaces.
export type SwEvent =
  | { type: 'STATE'; state: AppState }
  | { type: 'DUPLICATE'; contact: string; agents: Array<{ id: string; name: string }> }
