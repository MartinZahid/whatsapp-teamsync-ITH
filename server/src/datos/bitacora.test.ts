// Prueba de punta a punta de la bitácora: RoomManager + SQLite en memoria.
// Se simula la conexión WebSocket con un objeto falso (no hace falta red).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WebSocket } from 'ws'
import { BaseDeDatos } from './conexion.js'
import { BitacoraSqlite } from './bitacorasqlite.js'
import { RoomManager } from '../logica/room-manager.js'
import { buscarOCrearAgente } from './agentes.js'

const conexionFalsa = () => ({ readyState: 1, send() {}, close() {} }) as unknown as WebSocket

// Da de alta a los agentes en la base y crea la sala (que los carga al arrancar).
function salaCon(base: BaseDeDatos, ...nombres: string[]): RoomManager {
  for (const nombre of nombres) buscarOCrearAgente(base, nombre)
  return new RoomManager(new BitacoraSqlite(base))
}

function filas(base: BaseDeDatos, sql: string): unknown[][] {
  const r = base.db.exec(sql)
  return r.length ? r[0].values : []
}

test('un turno completo deja la bitácora y las sesiones correctas', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana', 'Luis')
  const ws = conexionFalsa()

  const id = sala.register(ws, 'Ana')!
  sala.handleMessage(id, { type: 'AVAILABLE', agent: 'Ana' })!        // ya estaba disponible: no cuenta
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana', contact: 'Juan Pérez' })
  sala.handleMessage(id, { type: 'HELP_REQUEST', agent: 'Ana', requesting: true })
  sala.handleMessage(id, { type: 'HELP_REQUEST', agent: 'Ana', requesting: false })
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana', contact: 'María' }) // cambia de chat
  sala.handleMessage(id, { type: 'PAUSED', agent: 'Ana' })
  sala.handleMessage(id, { type: 'AVAILABLE', agent: 'Ana' })
  sala.disconnect(id, ws)

  const tipos = filas(base, 'SELECT type, status_ref FROM events ORDER BY id')
  assert.deepEqual(tipos, [
    ['connected', null],
    ['available', 2],
    ['chat_start', 1],
    ['help_request', null],
    ['help_cancel', null],
    ['chat_end', null],
    ['chat_start', 1],
    ['chat_end', null],
    ['paused', 3],
    ['available', 2],
    ['disconnected', 4]
  ])

  // Dos sesiones, ambas cerradas, con su contacto.
  const sesiones = filas(base, `SELECT c.name, s.status FROM sessions s JOIN contacts c ON c.id = s.contact_ref ORDER BY s.id`)
  assert.deepEqual(sesiones, [['Juan Pérez', 'closed'], ['María', 'closed']])

  // La ayuda queda ligada a la sesión de Juan Pérez.
  const ayuda = filas(base, `SELECT session_ref FROM events WHERE type = 'help_request'`)
  assert.equal(ayuda[0][0], 1)

  // Foto final: desconectado y sin chat.
  assert.deepEqual(filas(base, 'SELECT status_ref, contact_ref FROM agent_status'), [[4, null]])
  assert.equal(filas(base, `SELECT detail FROM events WHERE type = 'disconnected'`)[0][0], 'conexión cerrada')
})

test('reconectar con el mismo nombre reutiliza el agente', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Luis')
  const ws1 = conexionFalsa()
  const id = sala.register(ws1, 'Luis')!
  sala.disconnect(id, ws1)!
  sala.register(conexionFalsa(), 'Luis')
  assert.equal(filas(base, 'SELECT count(*) FROM agents')[0][0], 1)
  assert.equal(filas(base, `SELECT count(*) FROM events WHERE type = 'connected'`)[0][0], 2)
})

test('duplicidad: un evento y una fila de participante por agente', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana', 'Luis')
  const ana = sala.register(conexionFalsa(), 'Ana')!
  const luis = sala.register(conexionFalsa(), 'Luis')!
  sala.handleMessage(ana, { type: 'ATTENDING', agent: 'Ana', contact: 'Juan Pérez' })
  sala.handleMessage(luis, { type: 'ATTENDING', agent: 'Luis', contact: 'juan  pérez' }) // mismo chat

  const alerta = filas(base, `SELECT agent_name, status_ref, detail FROM events WHERE type = 'duplicate_alert'`)
  assert.deepEqual(alerta, [['Luis', null, 'Luis, Ana']])

  // Cada participante con SU sesión (Luis = 2, Ana = 1).
  const participantes = filas(base, `
    SELECT a.name, p.session_ref FROM event_participants p JOIN agents a ON a.id = p.agent_ref ORDER BY p.id`)
  assert.deepEqual(participantes, [['Luis', 2], ['Ana', 1]])
})
test('solo se conectan los agentes dados de alta en la base', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana')
  assert.equal(sala.register(conexionFalsa(), 'Intruso'), null)
  assert.ok(sala.register(conexionFalsa(), 'Ana'))
  assert.equal(filas(base, 'SELECT count(*) FROM agents')[0][0], 1)
})

test('al arrancar, la presencia ya muestra a todo el equipo como Desconectado', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana', 'Luis')
  const presencia = sala.getAllAgents().map((a) => [a.name, a.status])
  assert.deepEqual(presencia, [['Ana', 'offline'], ['Luis', 'offline']])
})


test('al apagar el servidor se cierran las sesiones abiertas', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana')
  const id = sala.register(conexionFalsa(), 'Ana')!
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana', contact: 'Juan' })
  sala.apagar()
  assert.deepEqual(filas(base, 'SELECT status FROM sessions'), [['closed']])
  assert.equal(filas(base, `SELECT detail FROM events WHERE type = 'disconnected'`)[0][0], 'servidor detenido')
})

test('si el servidor se cayó, al arrancar cierra lo que quedó abierto', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana')
  const id = sala.register(conexionFalsa(), 'Ana')!
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana', contact: 'Juan' })
  // "Caída": no se llama a apagar(). Se arranca otra sala sobre la misma base.
  new RoomManager(new BitacoraSqlite(base))
  assert.deepEqual(filas(base, 'SELECT status, duration_seconds IS NOT NULL FROM sessions'), [['closed', 1]])
  assert.deepEqual(filas(base, 'SELECT status_ref, contact_ref FROM agent_status'), [[4, null]])
})

test('un agente dado de alta con el servidor corriendo puede conectarse', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana')
  buscarOCrearAgente(base, 'Nuevo') // como lo haría el dashboard
  assert.ok(sala.register(conexionFalsa(), 'Nuevo'))
})

test('la baja la hace el servidor (dashboard), no la extensión', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana')
  const id = sala.register(conexionFalsa(), 'Ana')!
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana', contact: 'Juan' })
  assert.equal(sala.darDeBaja('Ana'), true)
  assert.equal(filas(base, 'SELECT active FROM agents')[0][0], 0)
  assert.deepEqual(filas(base, 'SELECT status FROM sessions'), [['closed']])
  assert.equal(sala.getAllAgents().length, 0)
})

test('ATTENDING sin contacto se ignora', async () => {
  const base = await BaseDeDatos.abrir(null)
  const sala = salaCon(base, 'Ana')
  const id = sala.register(conexionFalsa(), 'Ana')!
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana' } as never)
  assert.equal(filas(base, 'SELECT count(*) FROM sessions')[0][0], 0)
})
