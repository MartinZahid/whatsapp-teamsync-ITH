import { testConnection } from '../src/lib/test-connection'
import {
  DEFAULT_AGENTS,
  DEFAULT_SELECTOR,
  DEFAULT_SERVER_URL,
  getAgentsList,
  getConfig,
  getConnection,
  getSelectors,
  saveAgentsList,
  saveConfig,
  saveSelectors,
  saveStatus,
  type ConnectionState
} from '../src/lib/storage'
import type { UiRequest } from '../src/lib/protocol'

const urlInput = document.getElementById('server-url') as HTMLInputElement
const testButton = document.getElementById('test') as HTMLButtonElement
const testResult = document.getElementById('test-result') as HTMLParagraphElement
const versionEl = document.getElementById('version') as HTMLElement
const serverState = document.getElementById('server-state') as HTMLElement
const agentName = document.getElementById('agent-name') as HTMLElement
const agentList = document.getElementById('agent-list') as HTMLUListElement
const addAgentButton = document.getElementById('add-agent') as HTMLButtonElement
const selectorInput = document.getElementById('selector') as HTMLInputElement
const saveButton = document.getElementById('save') as HTMLButtonElement
const saveResult = document.getElementById('save-result') as HTMLSpanElement
const resetButton = document.getElementById('reset') as HTMLButtonElement

function send(message: UiRequest): void {
  chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError)
}

function addAgentRow(value = ''): void {
  const item = document.createElement('li')

  const input = document.createElement('input')
  input.type = 'text'
  input.value = value
  input.placeholder = 'Nombre del agente'

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'remove'
  remove.textContent = 'Quitar'
  remove.addEventListener('click', () => item.remove())

  item.append(input, remove)
  agentList.append(item)
}

function renderAgents(names: string[]): void {
  agentList.replaceChildren()
  for (const name of names) addAgentRow(name)
}

function readAgents(): string[] {
  const names = Array.from(agentList.querySelectorAll('input'))
    .map((input) => input.value.trim())
    .filter((name) => name.length > 0)

  const unique = Array.from(new Set(names))
  return unique.length > 0 ? unique : DEFAULT_AGENTS
}

// Refleja en la tarjeta "Información del sistema" el estado de la conexión.
function renderConnection(status: ConnectionState['status']): void {
  serverState.textContent =
    status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando' : 'Desconectado'
  serverState.className = status === 'connected' ? 'ok' : status === 'connecting' ? '' : 'bad'
}

async function init(): Promise<void> {
  const [config, agents, selectors, connection] = await Promise.all([
    getConfig(),
    getAgentsList(),
    getSelectors(),
    getConnection()
  ])

  urlInput.value = config.serverUrl
  selectorInput.value = selectors.chatTitle
  agentName.textContent = config.name || '—'
  renderAgents(agents)
  renderConnection(connection.status)

  try {
    versionEl.textContent = chrome.runtime.getManifest().version
  } catch {
    // Si no está disponible, se conserva la versión escrita en el HTML.
  }
}

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

addAgentButton.addEventListener('click', () => addAgentRow())

saveButton.addEventListener('click', async () => {
  const config = await getConfig()
  const nextConfig = {
    ...config,
    serverUrl: urlInput.value.trim() || DEFAULT_SERVER_URL
  }
  const agents = readAgents()
  const selectors = { chatTitle: selectorInput.value.trim() || DEFAULT_SELECTOR }

  await Promise.all([
    saveConfig(nextConfig),
    saveAgentsList(agents),
    saveSelectors(selectors)
  ])

  // El service worker se encarga de reconectar si cambió la URL.
  send({ type: 'SET_CONFIG', config: nextConfig })
  renderAgents(agents)
  agentName.textContent = nextConfig.name || '—'

  saveResult.textContent = '✓ Cambios guardados.'
  saveResult.style.color = '#16a34a'
  setTimeout(() => {
    saveResult.textContent = ''
  }, 3000)
})

resetButton.addEventListener('click', async () => {
  const defaults = { name: '', serverUrl: DEFAULT_SERVER_URL }

  await Promise.all([
    saveConfig(defaults),
    saveAgentsList(DEFAULT_AGENTS),
    saveSelectors({ chatTitle: DEFAULT_SELECTOR }),
    saveStatus('available')
  ])

  send({ type: 'SET_CONFIG', config: defaults })
  urlInput.value = DEFAULT_SERVER_URL
  selectorInput.value = DEFAULT_SELECTOR
  renderAgents(DEFAULT_AGENTS)
  agentName.textContent = '—'

  saveResult.textContent = '✓ Configuración restablecida.'
  saveResult.style.color = '#16a34a'
  setTimeout(() => {
    saveResult.textContent = ''
  }, 3000)
})

void init()
