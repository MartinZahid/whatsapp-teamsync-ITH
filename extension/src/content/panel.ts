// Panel flotante del equipo, dibujado dentro de un Shadow DOM.
//
// ¿Por qué Shadow DOM? Porque WhatsApp Web tiene sus propios estilos y podría
// "romper" nuestro panel. El Shadow DOM crea una burbuja: los estilos de la
// página no entran y los nuestros no salen. Así el panel se ve siempre igual.
//
// El aspecto reproduce el diseño original del prototipo (Whatsapp-teamSync).

import type { AgentStatus, ChatDecision } from '@shared/types'
import { STATUS_COLORS, STATUS_LABELS } from '@shared/types'
import { getPanelCollapsed, savePanelCollapsed, type ConnectionState } from '../lib/storage'
import { CONNECTION_LABELS, chatDecisionText, initials, writingConflictText } from '../lib/ui'

type Connection = ConnectionState['status']

// Lo mínimo que el panel necesita de cada agente para dibujarlo.
export interface PanelAgent {
  name: string
  status: AgentStatus
  contact: string | null
  requesting: boolean
  attendingSince: number | null
}

// Acciones que el panel puede pedirle al resto de la extensión.
export interface PanelActions {
  onPause?: () => void
  onHelp?: () => void
  // Botones del aviso de duplicidad (RN-07).
  onDecision?: (contact: string, decision: ChatDecision) => void
}

// Lo que devuelve `mountPanel` para poder actualizarlo desde fuera.
export interface Panel {
  render: (agents: PanelAgent[], selfName: string, connection: Connection) => void
  // Ventana al centro con Tomar / Ceder; se queda hasta que elijan (RN-07).
  // `others` = los OTROS agentes que escribieron en el chat.
  showDuplicate: (contact: string, others: string[]) => void
  // Ventana al centro: "Ana tomó el chat", con el botón Entendido.
  showDecision: (agent: string, decision: ChatDecision, contact: string) => void
  hideAlert: () => void
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
  /* Ventana al centro (RN-07): oscurece WhatsApp para que no se pase por alto. */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(17, 24, 39, 0.55);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .overlay[hidden] { display: none; }
  .dialog {
    width: 380px;
    max-width: calc(100vw - 32px);
    padding: 24px;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.3);
    text-align: center;
  }
  .dialog-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 12px;
    border-radius: 50%;
    background: #fee2e2;
    color: #b91c1c;
    font-size: 24px;
    line-height: 48px;
  }
  .dialog-title {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }
  .dialog-text {
    margin-top: 8px;
    font-size: 15px;
    line-height: 1.45;
    color: #374151;
  }
  .dialog-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }
  .dialog-buttons button {
    flex: 1;
    height: 44px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #ffffff;
    color: #111827;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
  .dialog-buttons button:hover { background: #f3f4f6; }
  .dialog-buttons button[hidden] { display: none; }
  .dialog-buttons .primary {
    border-color: #dc2626;
    background: #dc2626;
    color: #ffffff;
  }
  .dialog-buttons .primary:hover { background: #b91c1c; }
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

  // Ventana al centro para la duplicidad (RN-07). Va fuera del panel, sobre
  // toda la página de WhatsApp.
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.hidden = true
  overlay.innerHTML = `
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="wts-titulo">
      <div class="dialog-icon" aria-hidden="true">!</div>
      <div class="dialog-title" id="wts-titulo"></div>
      <div class="dialog-text"></div>
      <div class="dialog-buttons">
        <button type="button" class="primary" data-accion="take">Tomar</button>
        <button type="button" data-accion="yield">Ceder</button>
        <button type="button" class="primary" data-accion="ok">Entendido</button>
      </div>
    </div>`
  shadow.appendChild(overlay)
  const dialogTitle = overlay.querySelector('.dialog-title') as HTMLDivElement
  const dialogText = overlay.querySelector('.dialog-text') as HTMLDivElement
  const takeButton = overlay.querySelector('[data-accion="take"]') as HTMLButtonElement
  const yieldButton = overlay.querySelector('[data-accion="yield"]') as HTMLButtonElement
  const okButton = overlay.querySelector('[data-accion="ok"]') as HTMLButtonElement

  const list = document.createElement('ul')
  list.className = 'list'
  panel.appendChild(list)

  const actionBar = document.createElement('div')
  actionBar.className = 'actions'
  panel.appendChild(actionBar)

  const pauseButton = document.createElement('button')
  pauseButton.type = 'button'
  pauseButton.className = 'pause'
  const pauseIcon = document.createElement('span')
  pauseIcon.style.display = 'contents'
  pauseIcon.innerHTML = PAUSE_ICON
  const pauseLabel = document.createElement('span')
  pauseLabel.textContent = 'Pausar'
  pauseButton.append(pauseIcon, pauseLabel)
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
    footText.textContent =
      connection === 'connected'
        ? `${CONNECTION_LABELS.connected} · Heartbeat activo`
        : CONNECTION_LABELS[connection]
    footDot.style.background = FOOTER_COLOR[connection]
  }

  const updateTimers = (): void => {
    for (const row of rows) {
      row.timer.textContent = elapsedSince(row.agent.attendingSince) ?? ''
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
      timer.textContent = elapsedSince(agent.attendingSince) ?? ''
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
    pauseIcon.innerHTML = paused ? PLAY_ICON : PAUSE_ICON
    pauseLabel.textContent = paused ? 'Reanudar' : 'Pausar'

    updateFooter()
  }

  // Chat del aviso de duplicidad que está en pantalla (para Tomar / Ceder).
  let alertContact: string | null = null

  // Muestra la ventana. `conDecision` = botones Tomar / Ceder; si no, Entendido.
  const openDialog = (title: string, text: string, conDecision: boolean): void => {
    dialogTitle.textContent = title
    dialogText.textContent = text
    takeButton.hidden = !conDecision
    yieldButton.hidden = !conDecision
    okButton.hidden = conDecision
    overlay.hidden = false
    ;(conDecision ? takeButton : okButton).focus()
  }

  const hideAlert = (): void => {
    alertContact = null
    overlay.hidden = true
  }

  // Otro agente también escribe en este chat: hay que elegir Tomar o Ceder.
  const showDuplicate = (contact: string, others: string[]): void => {
    alertContact = contact
    openDialog('Chat duplicado', writingConflictText(contact, others), true)
  }

  // El otro agente ya eligió: "Luis Ramírez te cedió el chat".
  const showDecision = (agent: string, decision: ChatDecision, contact: string): void => {
    alertContact = null
    openDialog(decision === 'take' ? 'Tomaron el chat' : 'Te cedieron el chat', chatDecisionText(agent, decision, contact), false)
  }

  const decide = (decision: ChatDecision): void => {
    if (alertContact) actions.onDecision?.(alertContact, decision)
    hideAlert() // a quien elige se le quita el aviso
  }
  takeButton.addEventListener('click', () => decide('take'))
  yieldButton.addEventListener('click', () => decide('yield'))
  okButton.addEventListener('click', hideAlert)

  const setCollapsed = (value: boolean): void => {
    applyCollapsed(value)
    void savePanelCollapsed(value)
  }

  const destroy = (): void => {
    clearInterval(ticker)
    host.remove()
  }

  return { render, showDuplicate, showDecision, hideAlert, setCollapsed, destroy }
}
