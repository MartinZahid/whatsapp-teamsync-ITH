// Panel flotante del equipo, dibujado dentro de un Shadow DOM.
//
// ¿Por qué Shadow DOM? Porque WhatsApp Web tiene sus propios estilos y podría
// "romper" nuestro panel. El Shadow DOM crea una burbuja: los estilos de la
// página no entran y los nuestros no salen. Así el panel se ve siempre igual.

import type { AgentStatus } from '@shared/types'
import { STATUS_COLORS, STATUS_LABELS } from '@shared/types'
import { getPanelCollapsed, savePanelCollapsed } from '../lib/storage'

// Lo mínimo que el panel necesita de cada agente para dibujarlo.
export interface PanelAgent {
  name: string
  status: AgentStatus
  contact: string | null
  requesting: boolean
}

// Acciones que el panel puede pedirle al resto de la extensión.
export interface PanelActions {
  onPause?: () => void
  onHelp?: () => void
}

// Lo que devuelve `mountPanel` para poder actualizarlo desde fuera.
export interface Panel {
  render: (agents: PanelAgent[], selfName: string) => void
  setCollapsed: (collapsed: boolean) => void
  destroy: () => void
}

const HOST_ID = 'wts-panel-root'

// Estilos propios del panel (aislados por el Shadow DOM).
const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .panel {
    width: 296px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22);
  }
  .panel.collapsed { width: auto; }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: #1f3b73;
    color: #ffffff;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
    flex: 0 0 auto;
  }
  .title { font-size: 14px; font-weight: 700; flex: 1; }
  .count { font-size: 12px; opacity: 0.85; }
  .collapse {
    border: 0;
    background: transparent;
    color: #ffffff;
    font-size: 14px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
  }
  .collapse:hover { background: rgba(255, 255, 255, 0.14); }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 280px;
    overflow-y: auto;
  }
  .panel.collapsed .list,
  .panel.collapsed .actions { display: none; }
  .agent {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 10px;
  }
  .agent.self { background: #f1f5f9; }
  .agent.help {
    background: #fdecec;
    box-shadow: inset 0 0 0 2px #ef4444;
  }
  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex: 0 0 auto;
  }
  .info { min-width: 0; flex: 1; }
  .name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: 11px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
  }
  .actions button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    padding: 9px 10px;
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    cursor: pointer;
  }
  .pause { background: #f59e0b; }
  .help { background: #ef4444; }
  .help.on { background: #b91c1c; }
`

// Texto secundario de cada agente: estado, contacto y aviso de ayuda.
function subtitle(agent: PanelAgent): string {
  const parts: string[] = [STATUS_LABELS[agent.status]]
  if (agent.contact) parts.push(agent.contact)
  if (agent.requesting) parts.push('solicita ayuda')
  return parts.join(' · ')
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

  const panel = document.createElement('div')
  panel.className = 'panel'
  wrap.appendChild(panel)

  // Cabecera: punto de conexión, título, contador y botón para contraer.
  const head = document.createElement('div')
  head.className = 'head'
  panel.appendChild(head)

  const dot = document.createElement('span')
  dot.className = 'dot'
  head.appendChild(dot)

  const title = document.createElement('span')
  title.className = 'title'
  title.textContent = 'Equipo'
  head.appendChild(title)

  const count = document.createElement('span')
  count.className = 'count'
  head.appendChild(count)

  const collapse = document.createElement('button')
  collapse.type = 'button'
  collapse.className = 'collapse'
  head.appendChild(collapse)

  // Lista de agentes.
  const list = document.createElement('ul')
  list.className = 'list'
  panel.appendChild(list)

  // Acciones del agente actual.
  const actionBar = document.createElement('div')
  actionBar.className = 'actions'
  panel.appendChild(actionBar)

  const pauseButton = document.createElement('button')
  pauseButton.type = 'button'
  pauseButton.className = 'pause'
  pauseButton.textContent = 'Pausar'
  pauseButton.addEventListener('click', () => actions.onPause?.())
  actionBar.appendChild(pauseButton)

  const helpButton = document.createElement('button')
  helpButton.type = 'button'
  helpButton.className = 'help'
  helpButton.textContent = 'Pedir ayuda'
  helpButton.addEventListener('click', () => actions.onHelp?.())
  actionBar.appendChild(helpButton)

  // Contraer / expandir (se recuerda entre sesiones).
  let collapsed = false
  const applyCollapsed = (value: boolean): void => {
    collapsed = value
    panel.classList.toggle('collapsed', collapsed)
    collapse.textContent = collapsed ? '▸' : '▾'
    collapse.setAttribute('aria-label', collapsed ? 'Expandir panel' : 'Contraer panel')
  }

  collapse.addEventListener('click', () => {
    applyCollapsed(!collapsed)
    void savePanelCollapsed(collapsed)
  })

  void getPanelCollapsed().then((value) => applyCollapsed(value))

  // Dibuja la lista completa. Se vuelve a llamar con cada actualización.
  const render = (agents: PanelAgent[], selfName: string): void => {
    list.replaceChildren()

    agents.forEach((agent) => {
      const item = document.createElement('li')
      item.className = 'agent'
      if (agent.name === selfName) item.classList.add('self')
      if (agent.requesting) item.classList.add('help')

      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      avatar.style.background = STATUS_COLORS[agent.status]
      avatar.textContent = initials(agent.name)
      item.appendChild(avatar)

      const info = document.createElement('div')
      info.className = 'info'

      const name = document.createElement('div')
      name.className = 'name'
      name.textContent = agent.name === selfName ? `${agent.name} (tú)` : agent.name
      info.appendChild(name)

      const sub = document.createElement('div')
      sub.className = 'sub'
      sub.textContent = subtitle(agent)
      info.appendChild(sub)

      item.appendChild(info)
      list.appendChild(item)
    })

    const online = agents.filter((agent) => agent.status !== 'offline').length
    count.textContent = `${online} en línea`

    // El botón de ayuda refleja si el agente actual ya la pidió.
    const self = agents.find((agent) => agent.name === selfName)
    const requesting = self?.requesting ?? false
    helpButton.classList.toggle('on', requesting)
    helpButton.textContent = requesting ? 'Cancelar ayuda' : 'Pedir ayuda'

    pauseButton.textContent = self?.status === 'paused' ? 'Reanudar' : 'Pausar'
  }

  // Permite contraer/expandir desde fuera (por ejemplo, al iniciar).
  const setCollapsed = (value: boolean): void => {
    applyCollapsed(value)
    void savePanelCollapsed(value)
  }

  const destroy = (): void => host.remove()

  return { render, setCollapsed, destroy }
}
