// Cliente de prueba por consola para validar la presencia y el heartbeat.
//
// Uso:
//   node scripts/test-client.mjs <nombre> [attending|available|paused|offline|help|nohelp] [contacto]
//
// Ejemplos (en terminales separadas):
//   node scripts/test-client.mjs Ana attending "Cliente SUSPIROS"
//   node scripts/test-client.mjs Luis available
//   node scripts/test-client.mjs Luis help      (solicita ayuda)
//   node scripts/test-client.mjs Luis nohelp    (la cancela)

import { WebSocket } from 'ws'

const name = process.argv[2] || 'AgentePrueba'
const action = process.argv[3] || 'available'
const contact = process.argv[4] || 'Contacto de prueba'
const url = process.env.SERVER_URL || 'ws://localhost:3001'

const ws = new WebSocket(url)

ws.on('open', () => {
  console.log(`[${name}] conectado a ${url}`)

  // El primer mensaje identifica al agente (lo registra como activo).
  send({ type: 'ATTENDING', agent: name, contact, status: 'active' })
  applyAction()

  // Señal de actividad cada 30 segundos.
  setInterval(() => send({ type: 'HEARTBEAT', agent: name }), 30000)
})

ws.on('message', (data) => {
  const message = JSON.parse(data.toString())

  if (message.type === 'PRESENCE_UPDATE') {
    console.log(`[${name}] presencia (${message.agents.length} agentes):`)
    for (const a of message.agents) {
      const contactInfo = a.contact ? ` - ${a.contact}` : ''
      const helpInfo = a.requesting ? ' · solicita ayuda' : ''
      console.log(`   - ${a.name}: ${a.status}${contactInfo}${helpInfo}`)
    }
  } else {
    console.log(`[${name}] ${message.type}: ${message.message ?? ''}`)
  }
})

ws.on('close', () => console.log(`[${name}] conexión cerrada`))
ws.on('error', (err) => console.error(`[${name}] error: ${err.message}`))

function send(message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

function applyAction() {
  if (action === 'attending') send({ type: 'ATTENDING', agent: name, contact, status: 'active' })
  else if (action === 'available') send({ type: 'AVAILABLE', agent: name })
  else if (action === 'paused') send({ type: 'PAUSED', agent: name, reason: 'prueba' })
  else if (action === 'offline') send({ type: 'OFFLINE', agent: name })
  else if (action === 'help') send({ type: 'HELP_REQUEST', agent: name, requesting: true })
  else if (action === 'nohelp') send({ type: 'HELP_REQUEST', agent: name, requesting: false })
}

// Cierra limpiamente con Ctrl+C.
process.on('SIGINT', () => {
  ws.close()
  process.exit(0)
})
