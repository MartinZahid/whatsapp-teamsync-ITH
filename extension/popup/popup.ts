import { STATUS_COLORS, STATUS_LABELS, type Agent, type AgentStatus } from '@shared/types'
import {
  DEFAULT_SERVER_URL,
  getAgentsList,
  getConfig,
  getConnection,
  getPresence,
  saveConfig,
  type AgentConfig
} from '../src/lib/storage'
import type { AppState, SwEvent, UiRequest } from '../src/lib/protocol'
import { testConnection } from '../src/lib/test-connection'

const logo = document.getElementById('logo') as HTMLImageElement
const currentBar = document.getElementById('current') as HTMLDivElement
const currentDot = document.getElementById('current-dot') as HTMLSpanElement
const currentName = document.getElementById('current-name') as HTMLSpanElement
const currentBadge = document.getElementById('current-badge') as HTMLSpanElement
const agentList = document.getElementById('agent-list') as HTMLUListElement
const urlInput = document.getElementById('server-url') as HTMLInputElement
const testButton = document.getElementById('test') as HTMLButtonElement
const testResult = document.getElementById('test-result') as HTMLParagraphElement
const pauseButton = document.getElementById('pause') as HTMLButtonElement
const helpButton = document.getElementById('help') as HTMLButtonElement
const connectionBox = document.getElementById('connection') as HTMLDivElement
const alertBox = document.getElementById('alert') as HTMLDivElement

let config: AgentConfig = { name: '', serverUrl: DEFAULT_SERVER_URL }
let appState: AppState | null = null
let agents: Agent[] = []
let names: string[] = []
let alertTimer: ReturnType<typeof setTimeout> | null = null

try {
  logo.src = chrome.runtime.getURL('icons/icon32.png')
} catch {
  // Sin API de Chrome (por ejemplo, en una prueba local).
}

function request<T = unknown>(message: UiRequest): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: T) => resolve(response))
  })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

// Pinta una etiqueta de estado (o la solicitud de ayuda) con su color.
function setBadge(badge: HTMLElement, status: AgentStatus, requesting: boolean): void {
  badge.className = 'badge ' + (requesting ? 'help' : status)
  badge.textContent = requesting ? 'Solicita ayuda' : STATUS_LABELS[status]
}

// Pinta la lista de agentes; el seleccionado se resalta.
function renderAgents(): void {
  agentList.replaceChildren()

  for (const name of names) {
    const agent = agents.find((item) => item.name === name)
    const status = agent?.status ?? 'offline'
    const requesting = agent?.requesting ?? false
    const selected = name === config.name

    const item = document.createElement('li')

    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'agent-row' + (selected ? ' selected' : '')
    row.addEventListener('click', () => selectAgent(name))

    const avatar = document.createElement('span')
    avatar.className = 'avatar'
    avatar.style.background = STATUS_COLORS[status]
    avatar.textContent = initials(name)

    const label = document.createElement('span')
    label.className = 'agent-name'
    label.textContent = name

    const badge = document.createElement('span')
    setBadge(badge, status, requesting)

    row.append(avatar, label, badge)
    item.append(row)
    agentList.append(item)
  }
}

function selectAgent(name: string): void {
  config = { ...config, name }
  void saveConfig(config)
  void request({ type: 'SET_CONFIG', config })
  renderAgents()
}

// Barra superior: conexión, agente actual y su estado.
function renderCurrent(status: AppState['connection']['status']): void {
  const self = agents.find((agent) => agent.name === config.name)
  const agentStatus: AgentStatus = self?.status ?? 'offline'
  const requesting = self?.requesting ?? false

  currentBar.classList.toggle('hidden', !config.name)
  currentName.textContent = config.name || 'Sin agente'
  currentDot.className = 'status-dot ' + status
  currentDot.style.background = STATUS_COLORS[agentStatus]
  setBadge(currentBadge, agentStatus, requesting)
}

function renderConnection(status: AppState['connection']['status']): void {
  connectionBox.className =
    'server-status' +
    (status === 'disconnected' ? ' bad' : status === 'connecting' ? ' warn' : '')
  connectionBox.textContent =
    status === 'connected'
      ? '✓ Conectado al servidor'
      : status === 'connecting'
        ? '… Conectando al servidor'
        : '✗ Sin conexión con el servidor'
}

function applyState(state: AppState): void {
  appState = state
  config = state.config
  agents = state.agents

  if (config.name && !names.includes(config.name)) names.push(config.name)
  if (document.activeElement !== urlInput && urlInput.value !== config.serverUrl) {
    urlInput.value = config.serverUrl
  }

  renderAgents()
  renderCurrent(state.connection.status)
  renderConnection(state.connection.status)

  const paused = state.status === 'paused'
  pauseButton.classList.toggle('resume', paused)
  pauseButton.textContent = paused ? 'Reanudar' : 'Pausar'

  helpButton.textContent = state.requesting ? 'Cancelar ayuda' : 'Pedir ayuda'
  helpButton.classList.toggle('on', state.requesting)
}

function showDuplicate(contact: string, names: string[]): void {
  alertBox.textContent = `Atención duplicada: "${contact}" (${names.join(', ')})`
  alertBox.classList.remove('hidden')
  if (alertTimer) clearTimeout(alertTimer)
  alertTimer = setTimeout(() => alertBox.classList.add('hidden'), 8000)
}

async function init(): Promise<void> {
  config = await getConfig()
  names = await getAgentsList()
  if (config.name && !names.includes(config.name)) names.push(config.name)

  urlInput.value = config.serverUrl

  const [presence, connection] = await Promise.all([getPresence(), getConnection()])
  agents = presence
  renderAgents()
  renderCurrent(connection.status)
  renderConnection(connection.status)

  const response = await request<{ ok: boolean; state?: AppState }>({ type: 'GET_STATE' })
  if (response?.state) applyState(response.state)
}

urlInput.addEventListener('change', () => {
  config = { ...config, serverUrl: urlInput.value.trim() || DEFAULT_SERVER_URL }
  urlInput.value = config.serverUrl
  void saveConfig(config)
  void request({ type: 'SET_CONFIG', config })
})

testButton.addEventListener('click', async () => {
  const url = urlInput.value.trim() || DEFAULT_SERVER_URL
  testResult.className = 'connection-result'
  testResult.textContent = 'Probando conexión…'

  const ok = await testConnection(url)
  testResult.className = 'connection-result ' + (ok ? 'ok' : 'bad')
  testResult.textContent = ok
    ? '✓ Conexión establecida con el servidor.'
    : '✗ No se pudo conectar con el servidor.'
})

pauseButton.addEventListener('click', () => {
  const next = appState?.status === 'paused' ? 'available' : 'paused'
  void request({ type: 'SET_STATUS', status: next })
})

helpButton.addEventListener('click', () => {
  void request({ type: 'SET_HELP', requesting: !(appState?.requesting ?? false) })
})

chrome.runtime.onMessage.addListener((event: SwEvent) => {
  if (event.type === 'STATE') {
    applyState(event.state)
  } else if (event.type === 'DUPLICATE') {
    showDuplicate(event.contact, event.agents.map((agent) => agent.name))
  }
})

void init()
