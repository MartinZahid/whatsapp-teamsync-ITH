// Pruebas de Reportes: sesiones escritas a mano con horas conocidas.
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
  sesion(ana, 'Ana', laura, local(11, 24, 10), 600)        // lunes 10:00, 10 min
  sesion(ana, 'Ana', laura, local(11, 24, 12, 30), 300)    // lunes 12:30, 5 min
  sesion(luis, 'Luis', numero, local(11, 25, 12, 5), 1200) // martes 12:05, 20 min
  sesion(luis, 'Luis', laura, local(11, 25, 16), null)     // martes 16:00, abierta
  return new Reportes(base)
}

test('resumen y gráficas de todo el periodo', async () => {
  const r = (await escenario()).generar(null, null)

  assert.deepEqual(r.resumen, { segundos: 2100, sesiones: 3, promedio: 700, contactos: 2, duplicidades: 0 })
  assert.deepEqual(r.porDia, [{ dia: '2026-11-24', segundos: 900 }, { dia: '2026-11-25', segundos: 1200 }])
  assert.deepEqual(r.porAgente.map((a) => a.agente), ['Luis', 'Ana'])
  // Horas pico cuenta también la sesión abierta (16 h), en hora local.
  assert.deepEqual(r.porHora, [{ hora: 10, sesiones: 1 }, { hora: 12, sesiones: 2 }, { hora: 16, sesiones: 1 }])
  assert.deepEqual(r.topContactos[0], { contacto: 'Laura Méndez', sinNombre: false, sesiones: 2, segundos: 900 })
  assert.equal(r.topContactos[1].sinNombre, true)
})

test('periodo: solo un día', async () => {
  const r = (await escenario()).generar(String(local(11, 25, 0)), String(local(11, 25, 23, 59)))
  assert.deepEqual([r.resumen.sesiones, r.resumen.segundos], [1, 1200])
  assert.deepEqual(r.porAgente, [{ agente: 'Luis', segundos: 1200 }])
  assert.equal(r.porHora.length, 2)
})
