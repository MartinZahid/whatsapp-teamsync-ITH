import { testConnection } from '../src/lib/test-connection'
import { fetchAgentNames } from '../src/lib/agents-api'
import {
  DEFAULT_SELECTOR,
  DEFAULT_SERVER_URL,
  getConfig,
  getConnection,
  getSelectors,
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
const selectorInput = document.getElementById('selector') as HTMLInputElement
const saveButton = document.getElementById('save') as HTMLButtonElement
const saveResult = document.getElementById('save-result') as HTMLSpanElement
const resetButton = document.getElementById('reset') as HTMLButtonElement

function send(message: UiRequest): void {
  chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError)
}

// Lista de SOLO LECTURA: los agentes vienen de la base del servidor.
// El alta y la baja se hacen con `npm run agentes` (luego, desde el dashboard).
async function renderAgents(serverUrl: string): Promise<void> {
  const { names, fromServer } = await fetchAgentNames(serverUrl)
  agentList.replaceChildren()
  for (const name of names) {
    const item = document.createElement('li')
    item.textContent = name
    agentList.append(item)
  }
  if (names.length === 0 || !fromServer) {
    const note = document.createElement('li')
    note.className = 'hint'
    note.textContent = fromServer
      ? 'No hay agentes dados de alta en el servidor.'
      : 'No se pudo leer la lista del servidor; se muestra la última guardada.'
    agentList.append(note)
  }
}

// Refleja en la tarjeta "Información del sistema" el estado de la conexión.
function renderConnection(status: ConnectionState['status']): void {
  serverState.textContent =
    status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando' : 'Desconectado'
  serverState.className = status === 'connected' ? 'ok' : status === 'connecting' ? '' : 'bad'
}

async function init(): Promise<void> {
  const [config, selectors, connection] = await Promise.all([
    getConfig(),
    getSelectors(),
    getConnection()
  ])

  urlInput.value = config.serverUrl
  selectorInput.value = selectors.chatTitle
  agentName.textContent = config.name || '—'
  void renderAgents(config.serverUrl)
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

saveButton.addEventListener('click', async () => {
  const config = await getConfig()
  const nextConfig = {
    ...config,
    serverUrl: urlInput.value.trim() || DEFAULT_SERVER_URL
  }
  const selectors = { chatTitle: selectorInput.value.trim() || DEFAULT_SELECTOR }

  await Promise.all([
    saveConfig(nextConfig),
    saveSelectors(selectors)
  ])

  // El service worker se encarga de reconectar si cambió la URL.
  send({ type: 'SET_CONFIG', config: nextConfig })
  void renderAgents(nextConfig.serverUrl)
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
    saveSelectors({ chatTitle: DEFAULT_SELECTOR }),
    saveStatus('available')
  ])

  send({ type: 'SET_CONFIG', config: defaults })
  urlInput.value = DEFAULT_SERVER_URL
  selectorInput.value = DEFAULT_SELECTOR
  void renderAgents(DEFAULT_SERVER_URL)
  agentName.textContent = '—'

  saveResult.textContent = '✓ Configuración restablecida.'
  saveResult.style.color = '#16a34a'
  setTimeout(() => {
    saveResult.textContent = ''
  }, 3000)
})

void init()
