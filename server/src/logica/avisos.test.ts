// Pruebas de los avisos del portal: base en memoria + RoomManager.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WebSocket } from 'ws'
import { buscarOCrearAgente } from '../datos/agentes.js'
import { BaseDeDatos } from '../datos/conexion.js'
import { BitacoraSqlite } from '../datos/bitacorasqlite.js'
import { ahora } from '../datos/tiempo.js'
import { Avisos } from './avisos.js'
import { RoomManager } from './room-manager.js'

async function preparar(...nombres: string[]) {
  const base = await BaseDeDatos.abrir(null)
  for (const nombre of nombres) buscarOCrearAgente(base, nombre)
  const sala = new RoomManager(new BitacoraSqlite(base))
  const ws = { readyState: 1, send() {}, close() {} } as unknown as WebSocket
  const ids = nombres.map((nombre) => sala.register(ws, nombre)!)
  return { base, sala, avisos: new Avisos(base, sala), ids }
}

test('ayuda: aparece quien la pide, con su chat y desde cuándo; se quita al cancelar', async () => {
  const { sala, avisos, ids: [ana, luis] } = await preparar('Ana', 'Luis')
  sala.handleMessage(ana, { type: 'ATTENDING', agent: 'Ana', contact: 'Carlos Peña' })
  sala.handleMessage(luis, { type: 'AVAILABLE', agent: 'Luis' })
  assert.deepEqual(avisos.ayuda(), [])

  const antes = ahora()
  sala.handleMessage(ana, { type: 'HELP_REQUEST', agent: 'Ana', requesting: true })
  const [solicitud] = avisos.ayuda()
  assert.deepEqual([solicitud.agente, solicitud.estado, solicitud.conversacion], ['Ana', 'attending', 'Carlos Peña'])
  assert.ok(solicitud.desde! >= antes)

  sala.handleMessage(ana, { type: 'HELP_REQUEST', agent: 'Ana', requesting: false })
  assert.deepEqual(avisos.ayuda(), [])
})

test('duplicidades: con el chat, los agentes y la hora; se filtran por fecha', async () => {
  const { sala, avisos, ids: [ana, luis] } = await preparar('Ana', 'Luis')
  for (const [id, nombre] of [[ana, 'Ana'], [luis, 'Luis']]) {
    sala.handleMessage(id, { type: 'ATTENDING', agent: nombre, contact: 'Carlos Peña' })
    sala.handleMessage(id, { type: 'WRITING', agent: nombre, contact: 'Carlos Peña' })
  }

  const [alerta] = avisos.duplicidades(ahora() - 60)
  assert.equal(alerta.contacto, 'Carlos Peña')
  assert.deepEqual([...alerta.agentes].sort(), ['Ana', 'Luis'])
  assert.ok(alerta.cuando <= ahora())

  assert.deepEqual(avisos.duplicidades(ahora() + 60), [], 'nada después de "ahora"')
  assert.equal(avisos.duplicidades(null).length, 1, 'sin fecha: últimas 24 h')
})
