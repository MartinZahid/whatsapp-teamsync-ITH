// Pruebas de la capa de datos. Usan una base EN MEMORIA (ruta = null),
// así no tocan el archivo real. Se corren con: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BaseDeDatos } from './conexion.js'
import { buscarOCrearAgente, darDeBajaAgente, listarAgentesActivos } from './agentes.js'
import { registrarContacto, telefonoDe } from './contactos.js'

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
  // `name` se queda como se vio la primera vez (ya no se sobrescribe).
  assert.deepEqual(base.todas('SELECT wa_id, name, phone FROM contacts'), [{ wa_id: 'juan pérez', name: 'Juan  Pérez', phone: null }])
})

test('el nombre puesto desde el dashboard no se pierde al volver a abrir el chat', async () => {
  const base = await BaseDeDatos.abrir(null)
  const id = registrarContacto(base, '+52 662 184 3920')
  base.ejecutar('UPDATE contacts SET name = ? WHERE id = ?', ['Ferretería El Sol', id])
  assert.equal(registrarContacto(base, '+52 662 184 3920'), id)
  assert.equal(base.una('SELECT name FROM contacts WHERE id = ?', [id])?.name, 'Ferretería El Sol')
})

test('un chat que es número guarda el teléfono solo con dígitos', async () => {
  const base = await BaseDeDatos.abrir(null)
  const id = registrarContacto(base, '+52 662 184 3920')
  assert.equal(base.una('SELECT phone FROM contacts WHERE id = ?', [id])?.phone, '526621843920')
})

test('un contacto viejo sin teléfono lo recibe al volver a abrir el chat', async () => {
  const base = await BaseDeDatos.abrir(null)
  const id = registrarContacto(base, '+52 662 184 3920')
  base.ejecutar('UPDATE contacts SET phone = NULL WHERE id = ?', [id]) // como antes del cambio
  registrarContacto(base, '+52 662 184 3920')
  assert.equal(base.una('SELECT phone FROM contacts WHERE id = ?', [id])?.phone, '526621843920')
})

test('detectar si el nombre del chat es un número de teléfono', () => {
  assert.equal(telefonoDe('+52 662 184 3920'), '526621843920')
  assert.equal(telefonoDe('+1 (555) 123-4567'), '15551234567')
  assert.equal(telefonoDe('6621843920'), '6621843920')
  assert.equal(telefonoDe('Ferretería El Sol'), null)
  assert.equal(telefonoDe('Juan 2'), null) // nombre con un número
  assert.equal(telefonoDe('Oficina 662 184 3920'), null) // texto + número
  assert.equal(telefonoDe('911'), null) // muy corto
  assert.equal(telefonoDe('+52 662 184 3920 1234567'), null) // más de 15 dígitos
})