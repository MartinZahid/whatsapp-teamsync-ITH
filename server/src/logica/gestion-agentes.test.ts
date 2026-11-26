// Pruebas de la gestión de agentes del portal: base en memoria + RoomManager.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WebSocket } from 'ws'
import { BaseDeDatos } from '../datos/conexion.js'
import { BitacoraSqlite } from '../datos/bitacorasqlite.js'
import { GestionAgentes } from './gestion-agentes.js'
import { RoomManager } from './room-manager.js'

async function preparar() {
  const base = await BaseDeDatos.abrir(null)
  const sala = new RoomManager(new BitacoraSqlite(base))
  return { base, sala, gestion: new GestionAgentes(base, sala) }
}
const nombresEnVivo = (sala: RoomManager) => sala.getAllAgents().map((a) => a.name).sort()

test('alta: se guarda con su número de empleado y aparece en la presencia', async () => {
  const { sala, gestion } = await preparar()
  assert.equal(gestion.alta('1002', '  Ana   Torres '), null)
  const [ana] = gestion.listar()
  assert.deepEqual([ana.empleado, ana.nombre, ana.activo, ana.estado], ['1002', 'Ana Torres', true, 'offline'])
  assert.deepEqual(nombresEnVivo(sala), ['Ana Torres'])
})

test('alta: faltan datos, nombre o número repetidos', async () => {
  const { gestion } = await preparar()
  gestion.alta('1002', 'Ana Torres')
  assert.equal(gestion.alta('', 'Luis')?.codigo, 400)
  assert.equal(gestion.alta('1003', 'Ana Torres')?.codigo, 409)
  assert.equal(gestion.alta('1002', 'Luis')?.codigo, 409)
  assert.equal(gestion.listar().length, 1)
})

test('editar: cambia nombre y número; la presencia usa el nombre nuevo', async () => {
  const { sala, gestion } = await preparar()
  gestion.alta('1002', 'Ana Torres')
  const [ana] = gestion.listar()
  assert.equal(gestion.editar(ana.id, '2002', 'Ana Torres López'), null)
  const [editada] = gestion.listar()
  assert.deepEqual([editada.empleado, editada.nombre, editada.activo], ['2002', 'Ana Torres López', true])
  assert.deepEqual(nombresEnVivo(sala), ['Ana Torres López'])
  assert.equal(gestion.editar(999, '1', 'X')?.codigo, 404)
})

test('baja: pasa a Inactivos, sale de la presencia y ya no puede conectarse', async () => {
  const { sala, gestion } = await preparar()
  gestion.alta('1002', 'Ana Torres')
  const [ana] = gestion.listar()
  const ws = { readyState: 1, send() {}, close() {} } as unknown as WebSocket
  const id = sala.register(ws, 'Ana Torres')!
  sala.handleMessage(id, { type: 'ATTENDING', agent: 'Ana Torres', contact: 'Juan' })

  assert.equal(gestion.baja(ana.id), null)
  assert.equal(gestion.listar()[0].activo, false)
  assert.deepEqual(nombresEnVivo(sala), [])
  assert.equal(sala.register(ws, 'Ana Torres'), null, 'ya no está dado de alta')
})

test('reactivar: vuelve a Activos y a la presencia; no si su nombre ya está en uso', async () => {
  const { sala, gestion } = await preparar()
  gestion.alta('1002', 'Ana Torres')
  const [ana] = gestion.listar()
  gestion.baja(ana.id)

  assert.equal(gestion.reactivar(ana.id), null)
  assert.equal(gestion.listar()[0].activo, true)
  assert.deepEqual(nombresEnVivo(sala), ['Ana Torres'])

  // Otra "Ana Torres" se dio de alta mientras la primera estaba inactiva.
  gestion.baja(ana.id)
  gestion.alta('3003', 'Ana Torres')
  assert.equal(gestion.reactivar(ana.id)?.codigo, 409)
})
