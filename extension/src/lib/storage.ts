import type { Agent, AgentStatus } from '@shared/types'

// Claves usadas en chrome.storage.local.
export const KEYS = {
  config: 'wts_config',
  agents: 'wts_agents',
  selectors: 'wts_selectors',
  presence: 'wts_presence',
  connection: 'wts_connection',
  status: 'wts_status',
  currentContact: 'wts_current_contact',
  panelCollapsed: 'wts_panel_collapsed'
} as const

export const DEFAULT_SERVER_URL = 'ws://localhost:3001'
export const DEFAULT_AGENTS = ['Ana Torres', 'Luis Ramírez', 'Pedro Sánchez', 'María Gómez']
export const DEFAULT_SELECTOR = '#main header span[title]'

export interface AgentConfig {
  name: string
  serverUrl: string
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected'
  message?: string
  updatedAt: number
}

export interface Selectors {
  chatTitle: string
}

function read<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key] as T | undefined))
  })
}

function write(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve())
  })
}

export async function getConfig(): Promise<AgentConfig> {
  return (await read<AgentConfig>(KEYS.config)) ?? { name: '', serverUrl: DEFAULT_SERVER_URL }
}

export function saveConfig(config: AgentConfig): Promise<void> {
  return write(KEYS.config, config)
}

export async function getAgentsList(): Promise<string[]> {
  return (await read<string[]>(KEYS.agents)) ?? DEFAULT_AGENTS
}

export function saveAgentsList(agents: string[]): Promise<void> {
  return write(KEYS.agents, agents)
}

export async function getSelectors(): Promise<Selectors> {
  return (await read<Selectors>(KEYS.selectors)) ?? { chatTitle: DEFAULT_SELECTOR }
}

export function saveSelectors(selectors: Selectors): Promise<void> {
  return write(KEYS.selectors, selectors)
}

export async function getPresence(): Promise<Agent[]> {
  return (await read<Agent[]>(KEYS.presence)) ?? []
}

export function savePresence(agents: Agent[]): Promise<void> {
  return write(KEYS.presence, agents)
}

export async function getConnection(): Promise<ConnectionState> {
  return (
    (await read<ConnectionState>(KEYS.connection)) ?? { status: 'disconnected', updatedAt: Date.now() }
  )
}

export function saveConnection(connection: ConnectionState): Promise<void> {
  return write(KEYS.connection, connection)
}

export async function getSavedStatus(): Promise<AgentStatus> {
  return (await read<AgentStatus>(KEYS.status)) ?? 'available'
}

export function saveStatus(status: AgentStatus): Promise<void> {
  return write(KEYS.status, status)
}

export async function getCurrentContact(): Promise<string | null> {
  return (await read<string | null>(KEYS.currentContact)) ?? null
}

export function saveCurrentContact(contact: string | null): Promise<void> {
  return write(KEYS.currentContact, contact)
}

export async function getPanelCollapsed(): Promise<boolean> {
  return (await read<boolean>(KEYS.panelCollapsed)) ?? false
}

export function savePanelCollapsed(collapsed: boolean): Promise<void> {
  return write(KEYS.panelCollapsed, collapsed)
}
