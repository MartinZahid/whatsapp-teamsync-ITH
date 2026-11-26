// CAPA 2 · LÓGICA — pestaña Reportes (RF-12).
//
// GUÍA DE LECTURA:
//   generar() junta en una sola respuesta todo lo que muestra la página:
//   las tarjetas del resumen y los datos de cada gráfica.
//   Limpia el periodo que manda la pantalla y calcula el promedio por sesión.

import type { BaseDeDatos } from '../datos/conexion.js'
import { telefonoDe } from '../datos/contactos.js'
import {
  contactosMasAtendidos,
  contarDuplicidades,
  resumen,
  sesionesPorHora,
  tiempoPorAgente,
  tiempoPorDia,
  type Periodo
} from '../datos/reportes.js'

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
  porAgente: { agente: string; segundos: number }[]
  porHora: { hora: number; sesiones: number }[]
  topContactos: { contacto: string; sinNombre: boolean; sesiones: number; segundos: number }[]
}

export class Reportes {
  constructor(private readonly base: BaseDeDatos) {}

  // `desde` y `hasta` llegan como texto (segundos Unix) o null = sin límite.
  generar(desde?: string | null, hasta?: string | null): Reporte {
    const p: Periodo = { desde: segundos(desde), hasta: segundos(hasta) }
    const r = resumen(this.base, p)
    return {
      resumen: {
        segundos: r.segundos,
        sesiones: r.sesiones,
        promedio: r.sesiones ? Math.round(r.segundos / r.sesiones) : 0,
        contactos: r.contactos,
        duplicidades: contarDuplicidades(this.base, p)
      },
      porDia: tiempoPorDia(this.base, p),
      porAgente: tiempoPorAgente(this.base, p),
      porHora: sesionesPorHora(this.base, p),
      topContactos: contactosMasAtendidos(this.base, p, TOP_CONTACTOS).map((c) => ({
        ...c,
        sinNombre: telefonoDe(c.contacto) !== null
      }))
    }
  }
}

// "1795700000" -> 1795700000; vacío o inválido -> null
function segundos(texto?: string | null): number | null {
  const n = Number(texto)
  return texto && Number.isInteger(n) ? n : null
}
