// Content script: se ejecuta dentro de WhatsApp Web.
// En este paso monta el panel flotante con datos de ejemplo; más adelante se
// conectará con el estado real que envía el service worker.

import type { PanelAgent } from './panel'
import { mountPanel } from './panel'

// Datos de ejemplo para revisar el diseño del panel.
const DEMO_AGENTS: PanelAgent[] = [
  { name: 'Ana Torres', status: 'active', contact: 'Cliente SUSPIROS', requesting: false },
  { name: 'Luis Ramírez', status: 'active', contact: 'Cliente NOVAMEX', requesting: false },
  { name: 'Pedro Sánchez', status: 'available', contact: null, requesting: false },
  { name: 'María Gómez', status: 'paused', contact: null, requesting: true }
]

const panel = mountPanel({
  onPause: () => console.log('[WTS] Pausar (pendiente de conectar)'),
  onHelp: () => console.log('[WTS] Pedir ayuda (pendiente de conectar)')
})

panel.render(DEMO_AGENTS, 'Luis Ramírez')

console.log('[WTS] panel flotante montado en', location.href)
