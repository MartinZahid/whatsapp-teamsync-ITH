// Panel flotante del equipo, dibujado dentro de un Shadow DOM.
//
// ¿Por qué Shadow DOM? Porque WhatsApp Web tiene sus propios estilos y podría
// "romper" nuestro panel. El Shadow DOM crea una burbuja: los estilos de la
// página no entran y los nuestros no salen. Así el panel se ve siempre igual.
//
// El aspecto reproduce el diseño original del prototipo (Whatsapp-teamSync).

import type { AgentStatus } from '@shared/types'
import { STATUS_COLORS, STATUS_LABELS } from '@shared/types'
import { getPanelCollapsed, savePanelCollapsed, type ConnectionState } from '../lib/storage'

type Connection = ConnectionState['status']

// Lo mínimo que el panel necesita de cada agente para dibujarlo.
export interface PanelAgent {
  name: string
  status: AgentStatus
  contact: string | null
  requesting: boolean
  activeSince: number | null
}

// Acciones que el panel puede pedirle al resto de la extensión.
export interface PanelActions {
  onPause?: () => void
  onHelp?: () => void
}

// Lo que devuelve `mountPanel` para poder actualizarlo desde fuera.
export interface Panel {
  render: (agents: PanelAgent[], selfName: string, connection: Connection) => void
  setCollapsed: (collapsed: boolean) => void
  destroy: () => void
}

const HOST_ID = 'wts-panel-root'

// Estilos propios del panel (aislados por el Shadow DOM).
const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .wrap {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .panel {
    width: 300px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    transform-origin: top right;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
    color: #ffffff;
  }
  .brand-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .logo {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
    display: block;
    flex: 0 0 auto;
  }
  .brand {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .toggle:hover { background: rgba(255, 255, 255, 0.3); }
  .toggle svg { width: 18px; height: 18px; stroke: currentColor; }
  .list {
    list-style: none;
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
  }
  .agent {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    transition: background 0.15s;
    position: relative;
  }
  .agent:hover { background: #f3f4f6; }
  .agent.self { background: #f0fdf4; }
  .agent.help {
    background: #fef2f2;
    border-left: 3px solid #ef4444;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    flex: 0 0 auto;
  }
  .info { flex: 1; min-width: 0; }
  .name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .timer {
    font-size: 10px;
    font-weight: 400;
    color: #6b7280;
    flex: 0 0 auto;
  }
  .status-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #4b5563;
    margin-top: 2px;
    min-width: 0;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .status-text { flex: 0 0 auto; }
  .contact {
    font-size: 11px;
    font-weight: 500;
    color: #ef4444;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  .contact.paused { color: #f59e0b; }
  .help-note { color: #dc2626; font-weight: 600; flex: 0 0 auto; }
  .actions {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid #e5e7eb;
  }
  .actions button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: transparent;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .actions button svg { width: 14px; height: 14px; }
  .pause { color: #f59e0b; }
  .pause:hover { background: #fef3c7; }
  .pause.resume {
    color: #9a3412;
    border-color: #25d366;
    background: #fed7aa;
  }
  .pause.resume:hover { background: #fdba74; }
  .help-btn { color: #ef4444; }
  .help-btn:hover { background: #fef2f2; }
  .help-btn.on {
    color: #991b1b;
    border-color: #ef4444;
    background: #fee2e2;
  }
  .help-btn.on:hover { background: #fecaca; }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid #fecaca;
    background: #fef2f2;
    font-size: 11px;
    color: #991b1b;
  }
  .foot.connected {
    background: #f0fdf4;
    border-top-color: #86efac;
    color: #166534;
  }
  .foot.connecting {
    background: #fffbeb;
    border-top-color: #fcd34d;
    color: #92400e;
  }
  .foot-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .pill {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 0;
    border-radius: 50px;
    background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
    color: #ffffff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .pill:hover { opacity: 0.9; }
  .pill svg { width: 18px; height: 18px; stroke: currentColor; }
  .pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffffff;
  }
  .pill.help-active {
    background: #dc2626;
    animation: wts-badge-pulse 1.5s ease-in-out infinite;
  }
  @keyframes wts-badge-pulse {
    0%, 100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12); }
    50% { box-shadow: 0 0 20px rgba(220, 38, 38, 0.5), 0 8px 32px rgba(0, 0, 0, 0.12); }
  }
  .wrap.collapsed .panel { display: none; }
  .wrap.collapsed .pill { display: flex; }
  @media (prefers-reduced-motion: reduce) {
    .panel, .pill.help-active { animation: none !important; }
  }
  .list::-webkit-scrollbar { width: 6px; }
  .list::-webkit-scrollbar-track { background: transparent; }
  .list::-webkit-scrollbar-thumb {
    background: #e5e7eb;
    border-radius: 3px;
  }
`

const CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
const CHEVRON_LEFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
const HELP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'

// Cronómetro en formato HH:MM:SS desde el inicio de la atención.
function elapsedSince(start: number | null): string | null {
  if (start === null) return null
  const total = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

// Dos letras para el avatar (por ejemplo "Ana Torres" -> "AT").
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

// Texto y color del pie según la conexión con el servidor.
const FOOTER_TEXT: Record<Connection, string> = {
  connected: 'Conectado al servidor · Heartbeat activo',
  connecting: 'Conectando al servidor…',
  disconnected: 'Sin conexión con el servidor'
}

const FOOTER_COLOR: Record<Connection, string> = {
  connected: '#22c55e',
  connecting: '#f59e0b',
  disconnected: '#ef4444'
}

export function mountPanel(actions: PanelActions = {}): Panel {
  // Si el content script se inyecta dos veces, no duplicamos el panel.
  const existing = document.getElementById(HOST_ID)
  if (existing) existing.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)

  const style = document.createElement('style')
  style.textContent = STYLES
  shadow.appendChild(style)

  const wrap = document.createElement('div')
  wrap.className = 'wrap'
  shadow.appendChild(wrap)

  // --- Panel expandido ---
  const panel = document.createElement('div')
  panel.className = 'panel'
  wrap.appendChild(panel)

  const head = document.createElement('div')
  head.className = 'head'
  panel.appendChild(head)

  const brandWrap = document.createElement('div')
  brandWrap.className = 'brand-wrap'
  head.appendChild(brandWrap)

  const logo = document.createElement('img')
  logo.className = 'logo'
  logo.alt = 'WhatsApp Team Sync'
  try {
    logo.src = chrome.runtime.getURL('icons/icon32.png')
  } catch {
    // Sin acceso a la API de Chrome (por ejemplo, en una prueba local).
  }
  brandWrap.appendChild(logo)

  const brand = document.createElement('span')
  brand.className = 'brand'
  brand.textContent = 'WhatsApp Team Sync'
  brandWrap.appendChild(brand)

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'toggle'
  toggle.innerHTML = CHEVRON_RIGHT
  head.appendChild(toggle)

  const list = document.createElement('ul')
  list.className = 'list'
  panel.appendChild(list)

  const actionBar = document.createElement('div')
  actionBar.className = 'actions'
  panel.appendChild(actionBar)

  const pauseButton = document.createElement('button')
  pauseButton.type = 'button'
  pauseButton.className = 'pause'
  pauseButton.innerHTML = PAUSE_ICON
  const pauseLabel = document.createElement('span')
  pauseLabel.textContent = 'Pausar'
  pauseButton.appendChild(pauseLabel)
  pauseButton.addEventListener('click', () => actions.onPause?.())
  actionBar.appendChild(pauseButton)

  const helpButton = document.createElement('button')
  helpButton.type = 'button'
  helpButton.className = 'help-btn'
  helpButton.innerHTML = HELP_ICON
  const helpLabel = document.createElement('span')
  helpLabel.textContent = 'Pedir ayuda'
  helpButton.appendChild(helpLabel)
  helpButton.addEventListener('click', () => actions.onHelp?.())
  actionBar.appendChild(helpButton)

  const foot = document.createElement('div')
  foot.className = 'foot'
  panel.appendChild(foot)

  const footDot = document.createElement('span')
  footDot.className = 'foot-dot'
  foot.appendChild(footDot)

  const footText = document.createElement('span')
  foot.appendChild(footText)

  // --- Panel colapsado (píldora) ---
  const pill = document.createElement('button')
  pill.type = 'button'
  pill.className = 'pill'
  wrap.appendChild(pill)

  const pillDot = document.createElement('span')
  pillDot.className = 'pill-dot'
  pill.appendChild(pillDot)

  const pillText = document.createElement('span')
  pill.appendChild(pillText)

  const pillArrow = document.createElement('span')
  pillArrow.innerHTML = CHEVRON_LEFT
  pill.appendChild(pillArrow)

  // --- Estado interno ---
  let collapsed = false
  let selfName = ''
  let connection: Connection = 'disconnected'
  let selfRequesting = false
  let rows: Array<{ agent: PanelAgent; timer: HTMLElement }> = []

  const applyCollapsed = (value: boolean): void => {
    collapsed = value
    wrap.classList.toggle('collapsed', collapsed)
    toggle.setAttribute('aria-label', collapsed ? 'Expandir panel' : 'Contraer panel')
  }

  toggle.addEventListener('click', () => {
    applyCollapsed(!collapsed)
    void savePanelCollapsed(collapsed)
  })

  pill.addEventListener('click', () => {
    applyCollapsed(false)
    void savePanelCollapsed(false)
  })

  void getPanelCollapsed().then((value) => applyCollapsed(value))

  const updateFooter = (): void => {
    foot.className = `foot ${connection}`
    footText.textContent = FOOTER_TEXT[connection]
    footDot.style.background = FOOTER_COLOR[connection]
  }

  const updateTimers = (): void => {
    for (const row of rows) {
      row.timer.textContent = elapsedSince(row.agent.activeSince) ?? ''
    }
  }

  // Refresca los cronómetros una vez por segundo.
  const ticker = setInterval(updateTimers, 1000)

  // Dibuja la lista completa. Se vuelve a llamar con cada actualización.
  const render = (agents: PanelAgent[], name: string, state: Connection): void => {
    selfName = name
    connection = state
    rows = []
    list.replaceChildren()

    agents.forEach((agent) => {
      const isSelf = agent.name === selfName
      const item = document.createElement('li')
      item.className = 'agent'
      if (isSelf) item.classList.add('self')
      if (agent.requesting) item.classList.add('help')

      const avatar = document.createElement('div')
      avatar.className = 'avatar'
      avatar.style.background = STATUS_COLORS[agent.status]
      avatar.textContent = initials(agent.name)
      item.appendChild(avatar)

      const info = document.createElement('div')
      info.className = 'info'

      const nameRow = document.createElement('div')
      nameRow.className = 'name-row'

      const nameEl = document.createElement('span')
      nameEl.className = 'name'
      nameEl.textContent = isSelf ? `${agent.name} (tú)` : agent.name
      nameRow.appendChild(nameEl)

      const timer = document.createElement('span')
      timer.className = 'timer'
      timer.textContent = elapsedSince(agent.activeSince) ?? ''
      nameRow.appendChild(timer)
      info.appendChild(nameRow)

      const statusRow = document.createElement('div')
      statusRow.className = 'status-row'

      const statusDot = document.createElement('span')
      statusDot.className = 'status-dot'
      statusDot.style.background = STATUS_COLORS[agent.status]
      statusRow.appendChild(statusDot)

      const statusText = document.createElement('span')
      statusText.className = 'status-text'
      statusText.textContent = STATUS_LABELS[agent.status]
      statusRow.appendChild(statusText)

      if (agent.contact) {
        const contact = document.createElement('span')
        contact.className = 'contact'
        if (agent.status === 'paused') contact.classList.add('paused')
        contact.textContent = agent.contact
        statusRow.appendChild(contact)
      }

      if (agent.requesting) {
        const note = document.createElement('span')
        note.className = 'help-note'
        note.textContent = '· solicita ayuda'
        statusRow.appendChild(note)
      }

      info.appendChild(statusRow)
      item.appendChild(info)
      list.appendChild(item)
      rows.push({ agent, timer })
    })

    // La píldora muestra cuántos agentes están en línea.
    const self = agents.find((agent) => agent.name === selfName)
    const online = agents.filter((agent) => agent.status !== 'offline').length
    pillText.textContent = `Agentes: ${online}`

    // El botón de ayuda y la píldora reflejan si el agente actual pidió ayuda.
    selfRequesting = self?.requesting ?? false
    pill.classList.toggle('help-active', selfRequesting)
    helpButton.classList.toggle('on', selfRequesting)
    helpLabel.textContent = selfRequesting ? 'Cancelar ayuda' : 'Pedir ayuda'

    // Pausar / Reanudar según el estado del agente actual.
    const paused = self?.status === 'paused'
    pauseButton.classList.toggle('resume', paused)
    pauseButton.replaceChildren(
      ...(paused ? [document.createRange().createContextualFragment(PLAY_ICON)] : [document.createRange().createContextualFragment(PAUSE_ICON)]),
      Object.assign(document.createElement('span'), { textContent: paused ? 'Disponible' : 'Pausar' })
    )

    updateFooter()
  }

  const setCollapsed = (value: boolean): void => {
    applyCollapsed(value)
    void savePanelCollapsed(value)
  }

  const destroy = (): void => {
    clearInterval(ticker)
    host.remove()
  }

  return { render, setCollapsed, destroy }
}
