// CAPA 2 · LÓGICA — pestaña Reportes (RF-12).
//
// GUÍA DE LECTURA:
//   generar() junta en una sola respuesta todo lo que muestra la página:
//   las tarjetas del resumen y los datos de cada gráfica y tabla.
//   - Limpia el periodo y el agente que manda la pantalla.
//   - Reparte el tiempo de cada sesión en las 24 horas del día: una atención
//     de 12:50 a 13:10 suma 10 min a las 12 h y 10 min a las 13 h.

import type { BaseDeDatos } from '../datos/conexion.js'
import { telefonoDe } from '../datos/contactos.js'
import {
  contactosMasAtendidos,
  contarDuplicidades,
  resumen,
  resumenPorAgente,
  sesionesCerradas,
  tiempoPorDia,
  tiempoPorEstado,
  type Periodo
} from '../datos/reportes.js'
import { ahora } from '../datos/tiempo.js'

const TOP_CONTACTOS = 5

export interface Reporte {
  resumen: {
    segundos: number          // tiempo total atendido
    sesiones: number          // sesiones atendidas (cerradas)
    promedio: number          // segundos por sesión
    contactos: number         // contactos distintos
    duplicidades: number      // alertas de duplicidad
  }
  porDia: { dia: string; segundos: number }[]
  porHora: { agente: string; minutos: number[] }[]       // 24 valores: 00 h a 23 h
  porEstado: { agente: string; atendiendo: number; disponible: number; pausado: number }[]  // segundos
  porAgente: { agente: string; segundos: number; sesiones: number; promedio: number; ayudas: number; duplicidades: number }[]
  topContactos: { contacto: string; sinNombre: boolean; sesiones: number; segundos: number }[]
}

export interface FiltrosReporte {
  desde?: string | null       // segundos Unix como texto
  hasta?: string | null
  agente?: string | null      // id del agente
}

export class Reportes {
  constructor(private readonly base: BaseDeDatos) {}

  generar(f: FiltrosReporte = {}): Reporte {
    const p: Periodo = { desde: entero(f.desde), hasta: entero(f.hasta), agente: entero(f.agente) }
    const r = resumen(this.base, p)
    // El último estado del periodo cuenta hasta el final del periodo (o hasta ahora).
    const fin = Math.min(p.hasta ?? ahora(), ahora())

    return {
      resumen: {
        segundos: r.segundos,
        sesiones: r.sesiones,
        promedio: r.sesiones ? Math.round(r.segundos / r.sesiones) : 0,
        contactos: r.contactos,
        duplicidades: contarDuplicidades(this.base, p)
      },
      porDia: tiempoPorDia(this.base, p),
      porHora: minutosPorHora(sesionesCerradas(this.base, p)),
      porEstado: estadosPorAgente(tiempoPorEstado(this.base, p, fin)),
      porAgente: resumenPorAgente(this.base, p).map((a) => ({
        ...a,
        promedio: a.sesiones ? Math.round(a.segundos / a.sesiones) : 0
      })),
      topContactos: contactosMasAtendidos(this.base, p, TOP_CONTACTOS).map((c) => ({
        ...c,
        sinNombre: telefonoDe(c.contacto) !== null
      }))
    }
  }
}

// Reparte cada sesión en las horas (hora local) que abarcó.
// -> una fila por agente, ordenadas por nombre, con 24 valores en minutos.
function minutosPorHora(sesiones: { agente: string; inicio: number; segundos: number }[]) {
  const porAgente = new Map<string, number[]>()
  for (const s of sesiones) {
    const minutos = porAgente.get(s.agente) ?? new Array<number>(24).fill(0)
    porAgente.set(s.agente, minutos)

    let t = s.inicio
    const termina = s.inicio + s.segundos
    while (t < termina) {
      const fecha = new Date(t * 1000)
      // Inicio de la hora siguiente (hora local).
      const siguienteHora = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), fecha.getHours() + 1).getTime() / 1000
      const hasta = Math.min(termina, siguienteHora)
      minutos[fecha.getHours()] += (hasta - t) / 60
      t = hasta
    }
  }
  return [...porAgente.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([agente, minutos]) => ({ agente, minutos: minutos.map((m) => Math.round(m * 10) / 10) }))
}

// [{ agente, estado, segundos }] -> [{ agente, atendiendo, disponible, pausado }]
function estadosPorAgente(filas: { agente: string; estado: number; segundos: number }[]) {
  const porAgente = new Map<string, { agente: string; atendiendo: number; disponible: number; pausado: number }>()
  for (const f of filas) {
    const fila = porAgente.get(f.agente) ?? { agente: f.agente, atendiendo: 0, disponible: 0, pausado: 0 }
    if (f.estado === 1) fila.atendiendo += f.segundos
    if (f.estado === 2) fila.disponible += f.segundos
    if (f.estado === 3) fila.pausado += f.segundos
    porAgente.set(f.agente, fila)
  }
  return [...porAgente.values()].sort((a, b) => a.agente.localeCompare(b.agente))
}

// "1795700000" -> 1795700000; vacío o inválido -> null
function entero(texto?: string | null): number | null {
  const n = Number(texto)
  return texto && Number.isInteger(n) ? n : null
}
