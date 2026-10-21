// Content script: se ejecuta dentro de WhatsApp Web.
// Monta el panel flotante y lo mantiene sincronizado con el service worker.

import type { AppState, SwEvent, UiRequest } from '../lib/protocol'
import { getConfig, getConnection, getPresence } from '../lib/storage'
import { startDetector } from './detector'
import { mountPanel } from './panel'

// Último estado recibido; se usa para saber qué pedir al pulsar un botón.
let latest: AppState | null = null

const panel = mountPanel({
  onPause: () => {
    // Si ya está pausado, reanudar; si no, pausar.
    const next = latest?.status === 'paused' ? 'available' : 'paused'
    send({ type: 'SET_STATUS', status: next })
  },
  onHelp: () => {
    send({ type: 'SET_HELP', requesting: !(latest?.requesting ?? false) })
  }
})

// Envía una petición al service worker (popup, opciones y panel usan lo mismo).
function send(request: UiRequest): void {
  chrome.runtime.sendMessage(request, () => {
    // Si el service worker está arrancando, no hay receptor todavía.
    void chrome.runtime.lastError
  })
}

function render(state: AppState): void {
  latest = state
  panel.render(state.agents, state.config.name, state.connection.status)
}

// Pinta algo mientras llega el primer estado real.
async function renderSaved(): Promise<void> {
  const [config, presence, connection] = await Promise.all([
    getConfig(),
    getPresence(),
    getConnection()
  ])
  panel.render(presence, config.name, connection.status)
}

// Canal permanente con el service worker. Él envía el estado al conectarse y
// cada vez que algo cambia.
function connectPort(): void {
  const port = chrome.runtime.connect({ name: 'wts-panel' })

  port.onMessage.addListener((event: SwEvent) => {
    if (event.type === 'STATE') render(event.state)
  })

  // Si el service worker se suspende, el puerto se cierra: reconectamos.
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError
    setTimeout(connectPort, 1500)
  })
}

void renderSaved()
connectPort()

// Avisa al service worker cada vez que se abre, cambia o se cierra el chat.
const detector = startDetector({
  onChange: (contact) => send({ type: 'CONTACT_CHANGED', contact })
})

// Con varias pestañas de WhatsApp abiertas, solo debe mandar la que se está
// viendo. Al volver a esta pestaña, reenviamos su chat para que el servidor
// refleje el que realmente está en pantalla.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') detector.refresh()
})

console.log('[WTS] panel flotante montado en', location.href)
