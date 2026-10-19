// Service worker: mantiene la conexión WebSocket con el servidor, envía el
// heartbeat y difunde el estado a las interfaces (popup, opciones y panel).
//
// Nota sobre Manifest V3: Chrome puede suspender este worker cuando está
// inactivo. Por eso el heartbeat y la reconexión también se apoyan en
// chrome.alarms, que despiertan al worker cada 30 segundos.

import type { Agent, AgentStatus } from '@shared/types'
import {
  DEFAULT_AGENTS,
  DEFAULT_SERVER_URL,
  getAgentsList,
  getConfig,
  getConnection,
  getCurrentContact,
  getPresence,
  getSavedStatus,
  saveAgentsList,
  saveConfig,
  saveConnection,
  saveCurrentContact,
  savePresence,
  saveStatus,
  type AgentConfig,
  type ConnectionState
} from '../lib/storage'
import type { AppState, SwEvent, UiRequest } from '../lib/protocol'

const HEARTBEAT_ALARM = 'wts-tick'
const TICK_MINUTES = 0.5
const MAX_ATTEMPTS = 10
const BADGE_MS = 8000

let config: AgentConfig = { name: '', serverUrl: DEFAULT_SERVER_URL }
let agents: Agent[] = []
let connection: ConnectionState = { status: 'disconnected', updatedAt: Date.now() }
let desiredStatus: AgentStatus = 'available'
let requesting = false
let currentContact: string | null = null

let socket: WebSocket | null = null
let attempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let duplicateTimer: ReturnType<typeof setTimeout> | null = null
let manualDisconnect = false

const ports = new Set<chrome.runtime.Port>()
const ready = init()

async function init(): Promise<void> {
  config = await getConfig()
  agents = await getPresence()
  connection = await getConnection()
  desiredStatus = await getSavedStatus()
  currentContact = await getCurrentContact()

  const list = await getAgentsList()
  await saveAgentsList(list.length ? list : DEFAULT_AGENTS)

  ensureAlarm()
  if (config.name) connect()
}

function ensureAlarm(): void {
  chrome.alarms.get(HEARTBEAT_ALARM, (alarm) => {
    if (!alarm) chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: TICK_MINUTES })
  })
}

// --- Estado compartido ------------------------------------------------------

function snapshot(): AppState {
  return { connection, agents, config, status: desiredStatus, requesting }
}

function emit(event: SwEvent): void {
  chrome.runtime.sendMessage(event, () => {
    // Si no hay ninguna interfaz abierta, Chrome reporta un error: se ignora.
    void chrome.runtime.lastError
  })
  for (const port of ports) {
    try {
      port.postMessage(event)
    } catch {
      ports.delete(port)
    }
  }
}

function emitState(): void {
  emit({ type: 'STATE', state: snapshot() })
}

async function setConnection(status: ConnectionState['status'], message?: string): Promise<void> {
  connection = { status, message, updatedAt: Date.now() }
  await saveConnection(connection)
  emitState()
}

// --- Conexión WebSocket -----------------------------------------------------

function connect(): void {
  if (!config.name) {
    void setConnection('disconnected', 'Selecciona un agente')
    return
  }
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  manualDisconnect = false
  void setConnection('connecting')

  const ws = new WebSocket(config.serverUrl)
  socket = ws

  ws.addEventListener('open', () => {
    if (socket !== ws) return
    attempts = 0
    // El primer mensaje identifica al agente (regla del servidor).
    send({
      type: 'ATTENDING',
      agent: config.name,
      contact: currentContact ?? 'sin chat',
      status: 'active'
    })
    applyStatus()
    if (requesting) send({ type: 'HELP_REQUEST', agent: config.name, requesting: true })
    void setConnection('connected')
  })

  ws.addEventListener('message', (event) => {
    if (socket !== ws) return
    try {
      handleServerMessage(JSON.parse(String(event.data)))
    } catch {
      // Un mensaje mal formado no debe tumbar la conexión.
    }
  })

  ws.addEventListener('close', () => {
    if (socket !== ws) return
    socket = null
    void setConnection('disconnected', 'Conexión cerrada')
    if (!manualDisconnect) scheduleReconnect()
  })

  ws.addEventListener('error', () => {
    if (socket !== ws) return
    void setConnection('disconnected', 'No se pudo conectar con el servidor')
  })
}

function closeSocket(): void {
  const old = socket
  socket = null
  try {
    old?.close()
  } catch {
    // La conexión ya estaba cerrada.
  }
}

function scheduleReconnect(): void {
  if (manualDisconnect) return

  attempts += 1
  if (attempts > MAX_ATTEMPTS) {
    void setConnection('disconnected', 'No se pudo reconectar con el servidor')
    return
  }

  const delay = Math.min(1000 * 2 ** (attempts - 1), 30000)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)

  void setConnection('disconnected', `Reintentando en ${Math.round(delay / 1000)} s`)
}

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function applyStatus(): void {
  if (desiredStatus === 'active') {
    send({
      type: 'ATTENDING',
      agent: config.name,
      contact: currentContact ?? 'sin chat',
      status: 'active'
    })
  } else if (desiredStatus === 'paused') {
    send({ type: 'PAUSED', agent: config.name, reason: 'manual' })
  } else if (desiredStatus === 'offline') {
    send({ type: 'OFFLINE', agent: config.name })
  } else {
    send({ type: 'AVAILABLE', agent: config.name })
  }
}

function handleServerMessage(message: {
  type?: string
  agents?: Agent[]
  contact?: string
  message?: string
}): void {
  switch (message.type) {
    case 'SERVER_INFO':
    case 'PRESENCE_UPDATE':
      agents = message.agents ?? []
      void savePresence(agents)
      emitState()
      break
    case 'DUPLICATE_ALERT':
      emit({
        type: 'DUPLICATE',
        contact: message.contact ?? '',
        agents: (message.agents ?? []).map((a) => ({ id: a.id, name: a.name }))
      })
      flashBadge()
      break
    case 'ERROR':
      void setConnection('disconnected', message.message ?? 'Error del servidor')
      break
    default:
      break
  }
}

function flashBadge(): void {
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' })
  chrome.action.setBadgeText({ text: '!' })
  if (duplicateTimer) clearTimeout(duplicateTimer)
  duplicateTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), BADGE_MS)
}

// --- Acciones pedidas por las interfaces ------------------------------------

async function applyStatusChange(status: AgentStatus): Promise<void> {
  desiredStatus = status
  await saveStatus(status)
  applyStatus()
  emitState()
}

async function applyHelp(value: boolean): Promise<void> {
  requesting = value
  send({ type: 'HELP_REQUEST', agent: config.name, requesting: value })
  emitState()
}

async function applyContact(contact: string | null): Promise<void> {
  currentContact = contact
  await saveCurrentContact(contact)

  // Si el agente está en pausa o desconectado, el cambio de chat no lo altera.
  if (desiredStatus === 'paused' || desiredStatus === 'offline') return

  desiredStatus = contact ? 'active' : 'available'
  await saveStatus(desiredStatus)
  applyStatus()
  emitState()
}

function setConfig(next: AgentConfig): void {
  const changed = next.name !== config.name || next.serverUrl !== config.serverUrl
  config = next
  void saveConfig(config)

  if (changed) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    closeSocket()
    attempts = 0
    if (config.name) connect()
    else void setConnection('disconnected', 'Selecciona un agente')
  }
  emitState()
}

function disconnect(): void {
  manualDisconnect = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket?.readyState === WebSocket.OPEN) send({ type: 'OFFLINE', agent: config.name })
  closeSocket()
  void setConnection('disconnected', 'Desconectado manualmente')
}

function handleUiRequest(message: UiRequest): Promise<unknown> | unknown {
  switch (message.type) {
    case 'GET_STATE':
      return { ok: true, state: snapshot() }
    case 'SET_CONFIG':
      setConfig(message.config)
      return { ok: true }
    case 'CONNECT':
      attempts = 0
      connect()
      return { ok: true }
    case 'DISCONNECT':
      disconnect()
      return { ok: true }
    case 'SET_STATUS':
      void applyStatusChange(message.status)
      return { ok: true }
    case 'SET_HELP':
      void applyHelp(message.requesting)
      return { ok: true }
    case 'CONTACT_CHANGED':
      void applyContact(message.contact)
      return { ok: true }
  }
}

// --- Eventos de Chrome ------------------------------------------------------

chrome.runtime.onMessage.addListener((message: UiRequest, _sender, sendResponse) => {
  ready.then(
    () => sendResponse(handleUiRequest(message)),
    (error) => sendResponse({ ok: false, error: String(error) })
  )
  return true
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wts-panel') return
  ports.add(port)
  port.onDisconnect.addListener(() => ports.delete(port))
  ready.then(() => {
    try {
      port.postMessage({ type: 'STATE', state: snapshot() } satisfies SwEvent)
    } catch {
      ports.delete(port)
    }
  })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return
  ready.then(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      send({ type: 'HEARTBEAT', agent: config.name })
    } else if (config.name && !manualDisconnect) {
      connect()
    }
  })
})

chrome.runtime.onInstalled.addListener(() => {
  ready.then(() => emitState())
})
