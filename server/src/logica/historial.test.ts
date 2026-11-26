// Pruebas del Historial: base en memoria + RoomManager generando eventos reales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WebSocket } from 'ws'
import { buscarAgentePorNombre, buscarOCrearAgente } from '../datos/agentes.js'
import { BaseDeDatos } from '../datos/conexion.js'
import { BitacoraSqlite } from '../datos/bitacorasqlite.js'
import { ahora } from '../datos/tiempo.js'
import { Historial } from './historial.js'
import { RoomManager } from './room-manager.js'

// Ana atiende a Juan y termina; Luis atiende a un número (sigue abierta) y pide
// ayuda; luego Ana entra al chat del número y los dos escriben (duplicidad).
async function escenario() {
  const base = await BaseDeDatos.abrir(null)
  for (const nombre of ['Ana', 'Luis']) buscarOCrearAgente(base, nombre)
  const sala = new RoomManager(new BitacoraSqlite(base))
  const ws = { readyState: 1, send() {}, close() {} } as unknown as WebSocket
  const ana = sala.register(ws, 'Ana')!
  const luis = sala.register(ws, 'Luis')!

  sala.handleMessage(ana, { type: 'ATTENDING', agent: 'Ana', contact: 'Juan Pérez' })
  sala.handleMessage(ana, { type: 'AVAILABLE', agent: 'Ana' })
  sala.handleMessage(luis, { type: 'ATTENDING', agent: 'Luis', contact: '+52 662 184 3920' })
  sala.handleMessage(luis, { type: 'HELP_REQUEST', agent: 'Luis', requesting: true })
  sala.handleMessage(ana, { type: 'ATTENDING', agent: 'Ana', contact: '+52 662 184 3920' })
  sala.handleMessage(luis, { type: 'WRITING', agent: 'Luis', contact: '+52 662 184 3920' })
  sala.handleMessage(ana, { type: 'WRITING', agent: 'Ana', contact: '+52 662 184 3920' })

  const id = (nombre: string) => String(buscarAgentePorNombre(base, nombre)!.id)
  return { base, sala, historial: new Historial(base), id, ws }
}

test('sesiones: filtros por agente, contacto (nombre o número) y fecha', async () => {
  const { historial, id } = await escenario()

  const todas = historial.sesiones({})
  assert.equal(todas.total, 3)
  assert.equal(todas.porPagina, 10)

  const deAna = historial.sesiones({ agente: id('Ana') })
  assert.equal(deAna.total, 2)
  const juan = deAna.filas.find((s) => s.contacto === 'Juan Pérez')!
  assert.deepEqual([juan.abierta, juan.sinNombre], [false, false])

  const porNumero = historial.sesiones({ contacto: '184 39' })
  assert.equal(porNumero.total, 2, 'busca también por los dígitos del teléfono')
  assert.ok(porNumero.filas.every((s) => s.sinNombre))

  assert.equal(historial.sesiones({ contacto: 'juan' }).total, 1)
  assert.equal(historial.sesiones({ desde: String(ahora() + 60) }).total, 0)
  assert.equal(historial.sesiones({ agente: 'no-es-numero' }).total, 3, 'filtro inválido = sin filtro')
})

test('eventos: detalle de cada tipo y duplicidad con sus dos agentes', async () => {
  const { historial, id } = await escenario()
  const { filas } = historial.eventos({})

  const fin = filas.find((e) => e.tipo === 'chat_end')!
  assert.equal(typeof fin.duracion, 'number')
  assert.equal(fin.contacto, 'Juan Pérez')

  const dup = filas.find((e) => e.tipo === 'duplicate_alert')!
  assert.deepEqual([...dup.agentes].sort(), ['Ana', 'Luis'])
  assert.equal(dup.sinNombre, true)

  assert.ok(filas.some((e) => e.tipo === 'help_request' && e.agentes[0] === 'Luis'))

  // La duplicidad aparece al filtrar por cualquiera de los dos agentes.
  const deAna = historial.eventos({ agente: id('Ana') }).filas
  assert.ok(deAna.some((e) => e.tipo === 'duplicate_alert'))
  assert.ok(!deAna.some((e) => e.tipo === 'help_request'), 'la ayuda es de Luis')
})

test('paginación: 10 por página', async () => {
  const { sala, historial } = await escenario()
  const ana = sala.getAllAgents().find((a) => a.name === 'Ana')!.id
  for (let i = 0; i < 10; i++) sala.handleMessage(ana, { type: 'ATTENDING', agent: 'Ana', contact: `Cliente ${i}` })

  const p1 = historial.sesiones({ pagina: '1' })
  const p2 = historial.sesiones({ pagina: '2' })
  assert.equal(p1.total, 13)
  assert.deepEqual([p1.filas.length, p2.filas.length, p2.pagina], [10, 3, 2])
  assert.equal(historial.sesiones({ pagina: '-5' }).pagina, 1)
})
