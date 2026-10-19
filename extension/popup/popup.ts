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

const agentSelect = document.getElementById('agent') as HTMLSelectElement
const urlInput = document.getElementById('server-url') as HTMLInputElement
const testButton = document.getElementById('test') as HTMLButtonElement
const testResult = document.getElementById('test-result') as HTMLParagraphElement
const dot = document.getElementById('dot') as HTMLSpanElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const statusDetail = document.getElementById('status-detail') as HTMLParagraphElement
const pauseButton = document.getElementById('pause') as HTMLButtonElement
const helpButton = document.getElementById('help') as HTMLButtonElement
const agentsList = document.getElementById('agents') as HTMLUListElement
const alertBox = document.getElementById('alert') as HTMLDivElement

let config: AgentConfig = { name: '', serverUrl: DEFAULT_SERVER_URL }
let appState: AppState | null = null
let alertTimer: ReturnType<typeof setTimeout> | null = null

function request<T = unknown>(message: UiRequest): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: T) => resolve(response))
  })
}

function renderStatus(status: AppState['connection']['status'], message?: string): void {
  dot.className =
    'dot' + (status === 'connected' ? ' connected' : status === 'connecting' ? ' connecting' : '')
  statusText.textContent =
    status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando…' : 'Desconectado'
  statusDetail.textContent = message ?? ''
}

function renderAgents(agents: Agent[]): void {
  agentsList.replaceChildren()

  if (agents.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'agent'
    empty.textContent = 'Sin agentes conectados'
    agentsList.append(empty)
    return
  }

  for (const agent of agents) {
    const item = document.createElement('li')
    item.className = 'agent' + (agent.requesting ? ' help' : '')

    const name = document.createElement('span')
    name.className = 'agent-name'

    const bullet = document.createElement('span')
    bullet.className = 'dot'
    bullet.style.background = STATUS_COLORS[agent.status]

    const label = document.createElement('span')
    label.textContent = agent.name === config.name ? `${agent.name} (tú)` : agent.name

    const pill = document.createElement('span')
    pill.className = 'pill'
    pill.style.background = STATUS_COLORS[agent.status]
    pill.textContent = STATUS_LABELS[agent.status]

    name.append(bullet, label)
    item.append(name, pill)
    agentsList.append(item)
  }
}

function applyState(state: AppState): void {
  appState = state
  config = state.config

  if (config.name && agentSelect.value !== config.name) {
    if (!Array.from(agentSelect.options).some((o) => o.value === config.name)) {
      const option = document.createElement('option')
      option.value = config.name
      option.textContent = config.name
      agentSelect.append(option)
    }
    agentSelect.value = config.name
  }

  if (urlInput.value !== config.serverUrl) urlInput.value = config.serverUrl

  renderStatus(state.connection.status, state.connection.message)
  pauseButton.textContent = state.status === 'paused' ? 'Reanudar' : 'Pausar'
  helpButton.textContent = state.requesting ? 'Cancelar ayuda' : 'Pedir ayuda'
  helpButton.classList.toggle('active', state.requesting)
  renderAgents(state.agents)
}

function showDuplicate(contact: string, names: string[]): void {
  alertBox.textContent = `Atención duplicada: "${contact}" (${names.join(', ')})`
  alertBox.classList.remove('hidden')
  if (alertTimer) clearTimeout(alertTimer)
  alertTimer = setTimeout(() => alertBox.classList.add('hidden'), 8000)
}

function fillAgentOptions(names: string[]): void {
  agentSelect.replaceChildren()

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = '— Selecciona un agente —'
  agentSelect.append(placeholder)

  for (const name of names) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    agentSelect.append(option)
  }
}

async function init(): Promise<void> {
  config = await getConfig()
  fillAgentOptions(await getAgentsList())
  agentSelect.value = config.name
  urlInput.value = config.serverUrl

  const [presence, connection] = await Promise.all([getPresence(), getConnection()])
  renderAgents(presence)
  renderStatus(connection.status, connection.message)

  const response = await request<{ ok: boolean; state?: AppState }>({ type: 'GET_STATE' })
  if (response?.state) applyState(response.state)
}

agentSelect.addEventListener('change', () => {
  config = { ...config, name: agentSelect.value }
  void saveConfig(config)
  void request({ type: 'SET_CONFIG', config })
})

urlInput.addEventListener('change', () => {
  config = { ...config, serverUrl: urlInput.value.trim() || DEFAULT_SERVER_URL }
  urlInput.value = config.serverUrl
  void saveConfig(config)
  void request({ type: 'SET_CONFIG', config })
})

testButton.addEventListener('click', async () => {
  const url = urlInput.value.trim() || DEFAULT_SERVER_URL
  testResult.textContent = 'Probando conexión…'
  testResult.style.color = '#6b7280'

  const ok = await testConnection(url)
  testResult.textContent = ok
    ? '✓ Conexión establecida con el servidor.'
    : '✗ No se pudo conectar con el servidor.'
  testResult.style.color = ok ? '#16a34a' : '#dc2626'
})

pauseButton.addEventListener('click', () => {
  const next: AgentStatus = appState?.status === 'paused' ? 'available' : 'paused'
  void request({ type: 'SET_STATUS', status: next })
})

helpButton.addEventListener('click', () => {
  void request({ type: 'SET_HELP', requesting: !(appState?.requesting ?? false) })
})

chrome.runtime.onMessage.addListener((event: SwEvent) => {
  if (event.type === 'STATE') {
    applyState(event.state)
  } else if (event.type === 'DUPLICATE') {
    showDuplicate(event.contact, event.agents.map((a) => a.name))
  }
})

void init()
