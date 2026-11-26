// Pruebas de la pestaña Contactos: base en memoria con dos contactos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BaseDeDatos } from '../datos/conexion.js'
import { registrarContacto } from '../datos/contactos.js'
import { Contactos } from './contactos.js'

async function escenario() {
  const base = await BaseDeDatos.abrir(null)
  const laura = registrarContacto(base, 'Laura Méndez')
  const numero = registrarContacto(base, '+52 662 184 3920')
  return { base, contactos: new Contactos(base), laura, numero }
}

test('listar: marca "sin nombre" a los chats que son un número', async () => {
  const { contactos, laura, numero } = await escenario()
  const lista = contactos.listar()
  const l = lista.find((c) => c.id === laura)!
  const n = lista.find((c) => c.id === numero)!
  assert.deepEqual([l.sinNombre, l.enWhatsapp, l.telefono], [false, 'Laura Méndez', null])
  assert.deepEqual([n.sinNombre, n.enWhatsapp, n.telefono], [true, '+52 662 184 3920', '526621843920'])
})

test('editar: pone nombre y número; el chat se sigue reconociendo', async () => {
  const { base, contactos, numero } = await escenario()
  assert.equal(contactos.editar(numero, '  Carlos   Peña ', '+52 662 184 3920'), null)

  const c = contactos.listar().find((x) => x.id === numero)!
  assert.deepEqual([c.nombre, c.sinNombre, c.enWhatsapp], ['Carlos Peña', false, '+52 662 184 3920'])

  // Al volver a abrir el chat en WhatsApp es el mismo contacto y no pierde el nombre.
  assert.equal(registrarContacto(base, '+52 662 184 3920'), numero)
  assert.equal(contactos.listar().find((x) => x.id === numero)!.nombre, 'Carlos Peña')
})

test('editar: errores', async () => {
  const { contactos, laura } = await escenario()
  assert.equal(contactos.editar(999, 'X', '')?.codigo, 404)
  assert.equal(contactos.editar(laura, '  ', '')?.codigo, 400)
  assert.equal(contactos.editar(laura, '662 123 4567', '')?.codigo, 400, 'el nombre no puede ser un número')
  assert.equal(contactos.editar(laura, 'Laura', '12ab')?.codigo, 400)
  assert.equal(contactos.editar(laura, 'Laura M.', ''), null, 'el número es opcional')
})
