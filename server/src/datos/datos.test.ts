// Pruebas de la capa de datos. Usan una base EN MEMORIA (ruta = null),
// así no tocan el archivo real. Se corren con: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BaseDeDatos } from './conexion.js'
import { buscarOCrearAgente, darDeBajaAgente, listarAgentesActivos } from './agentes.js'
import { registrarContacto } from './contactos.js'

test('la base nueva trae las 8 tablas y los 4 estados', async () => {
  const base = await BaseDeDatos.abrir(null)
  const tablas = base.una("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite%'")
  assert.equal(tablas?.n, 8)
  const estados = base.todas('SELECT code FROM status ORDER BY id').map((fila) => fila.code)
  assert.deepEqual(estados, ['attending', 'available', 'paused', 'offline'])
})

test('un agente se crea una sola vez y se reutiliza por nombre', async () => {
  const base = await BaseDeDatos.abrir(null)
  const a = buscarOCrearAgente(base, 'Ana', 'Ana-1')
  const b = buscarOCrearAgente(base, 'Ana', 'Ana-2')
  assert.equal(a.id, b.id)
  assert.equal(b.agentId, 'Ana-1')
  assert.equal(listarAgentesActivos(base).length, 1)
})

test('la baja es lógica: el agente deja de listarse pero la fila sigue', async () => {
  const base = await BaseDeDatos.abrir(null)
  const a = buscarOCrearAgente(base, 'Luis', 'Luis-1')
  darDeBajaAgente(base, a.id)
  assert.equal(listarAgentesActivos(base).length, 0)
  assert.equal(base.una('SELECT count(*) AS n FROM agents')?.n, 1)
})

test('el contacto se normaliza: mismo chat escrito distinto = mismo contacto', async () => {
  const base = await BaseDeDatos.abrir(null)
  const id1 = registrarContacto(base, 'Juan  Pérez ')
  const id2 = registrarContacto(base, 'juan pérez')
  assert.equal(id1, id2)
  assert.deepEqual(base.todas('SELECT wa_id, name FROM contacts'), [{ wa_id: 'juan pérez', name: 'juan pérez' }])
})