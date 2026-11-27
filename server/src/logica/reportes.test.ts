// Pruebas de Reportes: sesiones y eventos escritos a mano con horas conocidas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarOCrearAgente } from '../datos/agentes.js'
import { BaseDeDatos } from '../datos/conexion.js'
import { registrarContacto } from '../datos/contactos.js'
import { Reportes } from './reportes.js'

// Segundos Unix de una fecha en hora local (mes 1-12).
const local = (mes: number, dia: number, hora: number, min = 0) =>
  Math.floor(new Date(2026, mes - 1, dia, hora, min).getTime() / 1000)

async function escenario() {
  const base = await BaseDeDatos.abrir(null)
  const ana = buscarOCrearAgente(base, 'Ana').id
  const luis = buscarOCrearAgente(base, 'Luis').id
  const laura = registrarContacto(base, 'Laura Méndez')
  const numero = registrarContacto(base, '+52 662 184 3920')

  const sesion = (agente: number, nombre: string, contacto: number, inicio: number, segundos: number | null) =>
    base.ejecutar(
      `INSERT INTO sessions (agent_ref, agent_name, contact_ref, started_at, ended_at, duration_seconds, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agente, nombre, contacto, inicio, segundos === null ? null : inicio + segundos, segundos, segundos === null ? 'open' : 'closed']
    )
  const evento = (agente: number, nombre: string, tipo: string, estado: number | null, cuando: number) => {
    base.ejecutar(
      'INSERT INTO events (agent_ref, agent_name, type, status_ref, created_at) VALUES (?, ?, ?, ?, ?)',
      [agente, nombre, tipo, estado, cuando]
    )
    return base.una<{ id: number }>('SELECT MAX(id) AS id FROM events')!.id
  }

  sesion(ana, 'Ana', laura, local(11, 24, 10), 600)           // lunes 10:00, 10 min
  sesion(ana, 'Ana', laura, local(11, 24, 12, 50), 1200)      // lunes 12:50 a 13:10 (se reparte)
  sesion(luis, 'Luis', numero, local(11, 25, 12, 5), 1500)    // martes 12:05, 25 min
  sesion(luis, 'Luis', laura, local(11, 25, 16), null)        // martes 16:00, abierta

  // Ana: disponible 9:00, atendiendo 10:00, disponible 10:10, pausada 11:00, sale 11:30.
  evento(ana, 'Ana', 'available', 2, local(11, 24, 9))
  evento(ana, 'Ana', 'chat_start', 1, local(11, 24, 10))
  evento(ana, 'Ana', 'chat_end', 2, local(11, 24, 10, 10))
  evento(ana, 'Ana', 'paused', 3, local(11, 24, 11))
  evento(ana, 'Ana', 'disconnected', 4, local(11, 24, 11, 30))
  evento(luis, 'Luis', 'help_request', null, local(11, 25, 12, 10))
  const dup = evento(luis, 'Luis', 'duplicate_alert', null, local(11, 25, 12, 20))
  for (const a of [ana, luis]) base.ejecutar('INSERT INTO event_participants (event_ref, agent_ref) VALUES (?, ?)', [dup, a])

  return { reportes: new Reportes(base), ana, luis }
}

test('resumen, días y contactos de todo el periodo', async () => {
  const r = (await escenario()).reportes.generar()
  assert.deepEqual(r.resumen, { segundos: 3300, sesiones: 3, promedio: 1100, contactos: 2, duplicidades: 1 })
  assert.deepEqual(r.porDia, [{ dia: '2026-11-24', segundos: 1800 }, { dia: '2026-11-25', segundos: 1500 }])
  assert.deepEqual(r.topContactos[0], { contacto: 'Laura Méndez', sinNombre: false, sesiones: 2, segundos: 1800 })
  assert.equal(r.topContactos[1].sinNombre, true)
})

test('24 horas: minutos por agente, repartidos entre horas', async () => {
  const r = (await escenario()).reportes.generar()
  const ana = r.porHora.find((a) => a.agente === 'Ana')!
  assert.equal(ana.minutos.length, 24)
  assert.deepEqual([ana.minutos[10], ana.minutos[12], ana.minutos[13]], [10, 10, 10])
  assert.equal(r.porHora.find((a) => a.agente === 'Luis')!.minutos[12], 25)
})

test('tiempo por estado y resumen por agente', async () => {
  const r = (await escenario()).reportes.generar()
  const ana = r.porEstado.find((a) => a.agente === 'Ana')!
  // disponible 9:00-10:00 + 10:10-11:00 = 110 min; atendiendo 10 min; pausado 30 min.
  assert.deepEqual([ana.disponible, ana.atendiendo, ana.pausado], [110 * 60, 10 * 60, 30 * 60])

  const luis = r.porAgente.find((a) => a.agente === 'Luis')!
  assert.deepEqual([luis.segundos, luis.sesiones, luis.ayudas, luis.duplicidades], [1500, 1, 1, 1])
  assert.equal(r.porAgente.find((a) => a.agente === 'Ana')!.duplicidades, 1)
})

test('filtros: un agente y un solo día', async () => {
  const { reportes, ana } = await escenario()
  const r = reportes.generar({ agente: String(ana) })
  assert.deepEqual([r.resumen.sesiones, r.resumen.duplicidades], [2, 1])
  assert.deepEqual(r.porHora.map((a) => a.agente), ['Ana'])
  assert.deepEqual(r.porAgente.map((a) => a.agente), ['Ana'])

  const dia = reportes.generar({ desde: String(local(11, 25, 0)), hasta: String(local(11, 25, 23, 59)) })
  assert.deepEqual([dia.resumen.sesiones, dia.resumen.segundos], [1, 1500])
  assert.deepEqual(dia.porEstado, [])
})
