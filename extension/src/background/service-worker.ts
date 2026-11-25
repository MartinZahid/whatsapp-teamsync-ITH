// Service worker: mantiene la conexión WebSocket con el servidor, envía el
// heartbeat y difunde el estado a las interfaces (popup, opciones y panel).
//
// Heartbeat: cada 5 s, SOLO mientras haya una pestaña de WhatsApp abierta
// (cada panel abre un "port" con este worker). Si se cierra WhatsApp, se
// cierra Chrome o el equipo hiberna, deja de llegar la señal y el servidor
// marca al agente Desconectado a los 15 s.
//
// Nota sobre Manifest V3: Chrome puede suspender este worker cuando está
// inactivo. Por eso la reconexión también se apoya en chrome.alarms, que
// despiertan al worker cada 30 segundos.

import type { Agent, AgentStatus, ClientToServerMessage, ServerToClientMessage } from '@shared/types'
import {
  DEFAULT_SERVER_URL,
  getConfig,
  getConnection,
  getCurrentContact,
  getPresence,
  getSavedStatus,
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
const HEARTBEAT_MS = 5000
const TICK_MINUTES = 0.5
const MAX_ATTEMPTS = 10
const BADGE_MS = 8000

let config: AgentConfig = { name: '', serverUrl: DEFAULT_SERVER_URL }
let agents: Agent[] = []
let connection: ConnectionState = { status: 'disconnected', updatedAt: Date.now() }
let desiredStatus: AgentStatus = 'available'
let requesting = false
let currentContact: string | null = null
// Chat en el que ya se avisó al servidor que el agente escribió (WRITING).
// Así se manda UNA vez por chat y no en cada tecla.
let escritoEn: string | null = null

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
    escritoEn = null // conexión nueva: el servidor ya no recuerda que escribió
    // El primer mensaje (el estado real) identifica al agente en el servidor.
    // Si el panel de WhatsApp aún no se enganchó (tarda ~1.5 s tras reiniciarse
    // este worker), se espera un poco para no marcarlo Desconectado un instante.
    const identificarse = (): void => {
      if (socket !== ws) return
      applyStatus()
      if (requesting) send({ type: 'HELP_REQUEST', agent: config.name, requesting: true })
    }
    if (ports.size > 0) identificarse()
    else setTimeout(identificarse, 2500)
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
    // Si fue manual o por REPLACED, ya se dejó el mensaje correcto.
    if (manualDisconnect) return
    void setConnection('disconnected', 'Conexión cerrada')
    scheduleReconnect()
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

function send(message: ClientToServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

// Estado que de verdad se manda al servidor: "Atendiendo" solo si hay un chat
// abierto (así nunca se manda un contacto inventado como "sin chat").
function effectiveStatus(): AgentStatus {
  if (ports.size === 0) return 'offline' // WhatsApp no está abierto
  return desiredStatus === 'attending' && !currentContact ? 'available' : desiredStatus
}

// Señal de vida cada 5 s, solo con WhatsApp abierto.
setInterval(() => {
  if (ports.size > 0) send({ type: 'HEARTBEAT', agent: config.name })
}, HEARTBEAT_MS)

function applyStatus(): void {
  const agent = config.name
  switch (effectiveStatus()) {
    case 'attending':
      send({ type: 'ATTENDING', agent, contact: currentContact ?? '' })
      break
    case 'paused':
      send({ type: 'PAUSED', agent, reason: 'manual' })
      break
    case 'offline':
      send({ type: 'OFFLINE', agent })
      break
    default:
      send({ type: 'AVAILABLE', agent })
  }
}

// Si el servidor nos ve en un estado distinto al nuestro (por ejemplo, nos
// marcó Desconectado por un heartbeat tardío pero el socket sigue abierto),
// reenviamos el estado real.
function resyncIfNeeded(): void {
  if (!config.name || socket?.readyState !== WebSocket.OPEN) return
  const self = agents.find((agent) => agent.name === config.name)
  // WhatsApp cerrado y el servidor ya nos marcó Desconectado: se olvida el
  // chat, para no reaparecer "Atendiendo" un chat viejo al volver a abrirlo.
  if (ports.size === 0) {
    if (self?.status === 'offline' && currentContact) {
      currentContact = null
      void saveCurrentContact(null)
    }
    // Sin WhatsApp no se manda nada: el servidor lo marca Desconectado a los
    // 15 s. Así, recargar WhatsApp no corta la atención.
    return
  }
  if (self?.status !== effectiveStatus()) applyStatus()
  // Al pasar a Desconectado el servidor borra la ayuda pendiente; si aquí
  // sigue activa, se vuelve a pedir para que popup, panel y servidor coincidan.
  if (self && self.requesting !== requesting) {
    send({ type: 'HELP_REQUEST', agent: config.name, requesting })
  }
}

function handleServerMessage(message: ServerToClientMessage): void {
  switch (message.type) {
    case 'SERVER_INFO':
    case 'PRESENCE_UPDATE':
      agents = message.agents
      void savePresence(agents)
      emitState()
      resyncIfNeeded()
      break
    case 'DUPLICATE_ALERT':
      emit({ type: 'DUPLICATE', contact: message.contact, agents: message.agents })
      flashBadge()
      break
    case 'ERROR':
      if (message.code === 'REPLACED') {
        // Otro navegador tomó este agente: no reintentamos, o se tumbarían en bucle.
        manualDisconnect = true
        void setConnection('disconnected', 'Este agente se abrió en otro navegador')
      } else if (message.code === 'UNKNOWN_AGENT') {
        // El nombre no está en la base: reintentar no sirve hasta que lo den de alta.
        manualDisconnect = true
        void setConnection('disconnected', 'Este agente no está dado de alta en el servidor')
      } else {
        console.warn('[WTS] Error del servidor:', message.code, message.message)
      }
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
  // Al reanudar con un chat abierto, el agente vuelve a "Atendiendo" (RN-01).
  desiredStatus = status === 'available' && currentContact ? 'attending' : status
  escritoEn = null
  // Se guarda el estado REAL: si se guardara 'available' con un chat abierto,
  // al reiniciarse el service worker el agente aparecería Disponible.
  await saveStatus(desiredStatus)
  applyStatus()
  emitState()
}

// El agente escribió en el chat abierto: se avisa al servidor UNA vez por chat
// (RN-07: la duplicidad cuenta cuando dos agentes escriben en el mismo chat).
function notifyWriting(): void {
  if (!currentContact || effectiveStatus() !== 'attending') return
  if (escritoEn === currentContact || socket?.readyState !== WebSocket.OPEN) return
  escritoEn = currentContact
  send({ type: 'WRITING', agent: config.name, contact: currentContact })
}

function applyHelp(value: boolean): void {
  requesting = value
  send({ type: 'HELP_REQUEST', agent: config.name, requesting: value })
  emitState()
}

async function applyContact(contact: string | null): Promise<void> {
  if (contact !== currentContact) escritoEn = null
  currentContact = contact
  await saveCurrentContact(contact)

  // Si el agente está en pausa o desconectado, el cambio de chat no lo altera.
  if (desiredStatus === 'paused' || desiredStatus === 'offline') return

  desiredStatus = contact ? 'attending' : 'available'
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
  } else if (config.name && connection.status !== 'connected') {
    // Eligió el MISMO agente estando desconectado: se vuelve a intentar.
    attempts = 0
    connect()
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

// Con varias pestañas de WhatsApp abiertas, cada una detecta su propio chat.
// Solo aceptamos el aviso de la pestaña que el usuario está viendo; así el
// estado no "parpadea" entre pestañas de fondo.
async function isActiveTab(tabId?: number): Promise<boolean> {
  // Los mensajes del popup u opciones no vienen de una pestaña: se aceptan.
  if (tabId === undefined) return true
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    return active?.id === tabId
  } catch {
    return true
  }
}

function handleUiRequest(
  message: UiRequest,
  sender?: chrome.runtime.MessageSender
): Promise<unknown> | unknown {
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
      applyHelp(message.requesting)
      return { ok: true }
    case 'WRITING':
      notifyWriting()
      return { ok: true }
    case 'CONTACT_CHANGED':
      void isActiveTab(sender?.tab?.id).then((active) => {
        if (active) void applyContact(message.contact)
      })
      return { ok: true }
  }
}

// --- Eventos de Chrome ------------------------------------------------------

chrome.runtime.onMessage.addListener((message: UiRequest, sender, sendResponse) => {
  ready.then(
    () => sendResponse(handleUiRequest(message, sender)),
    (error) => sendResponse({ ok: false, error: String(error) })
  )
  return true
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wts-panel') return
  ports.add(port)
  port.onDisconnect.addListener(() => ports.delete(port))
  ready.then(() => {
    // Se abrió WhatsApp: si el servidor nos ve distinto, se manda el estado real.
    if (ports.size === 1) resyncIfNeeded()
    try {
      port.postMessage({ type: 'STATE', state: snapshot() } satisfies SwEvent)
    } catch {
      ports.delete(port)
    }
  })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return
  // La alarma ya no manda heartbeat (eso va cada 5 s con WhatsApp abierto);
  // solo reconecta si la conexión se cayó.
  ready.then(() => {
    if (socket?.readyState !== WebSocket.OPEN && config.name && !manualDisconnect) connect()
  })
})

chrome.runtime.onInstalled.addListener(() => {
  ready.then(() => emitState())
})
