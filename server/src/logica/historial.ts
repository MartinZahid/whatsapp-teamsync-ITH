// CAPA 2 · LÓGICA — Historial del portal.
//
// GUÍA DE LECTURA:
//   - Limpia los filtros que llegan de la pantalla (números, textos vacíos).
//   - Calcula la página (10 filas por página) y pide a la capa de datos el
//     total y las filas.
//   - Arma cada fila como la muestra el portal: marca "sin nombre" cuando el
//     contacto sigue siendo un número; en las duplicidades da la lista de agentes.

import { telefonoDe } from '../datos/contactos.js'
import type { BaseDeDatos } from '../datos/conexion.js'
import {
  contarEventos,
  contarSesiones,
  listarEventos,
  listarSesiones,
  type FiltrosHistorial
} from '../datos/historial.js'
import { ahora } from '../datos/tiempo.js'

const POR_PAGINA = 10

// Lo que manda la pantalla, sin revisar (todo llega como texto o null).
export interface FiltrosCrudos {
  agente?: string | null
  contacto?: string | null
  desde?: string | null
  hasta?: string | null
  pagina?: string | null
}

export interface Pagina<T> {
  total: number
  pagina: number
  porPagina: number
  filas: T[]
}

export interface SesionHistorial {
  id: number
  agente: string
  contacto: string
  sinNombre: boolean          // el contacto sigue siendo un número de teléfono
  inicio: number              // segundos Unix
  fin: number | null
  duracion: number            // segundos (si sigue abierta: hasta ahora)
  abierta: boolean
}

export interface EventoHistorial {
  id: number
  cuando: number              // segundos Unix
  tipo: string                // connected, chat_start, chat_end, help_request, ...
  agentes: string[]           // uno, o los de la duplicidad
  contacto: string | null
  sinNombre: boolean
  duracion: number | null     // en 'chat_end': cuánto duró la atención
  motivo: string | null       // en 'disconnected': por qué se desconectó
}

export class Historial {
  constructor(private readonly base: BaseDeDatos) {}

  sesiones(crudos: FiltrosCrudos): Pagina<SesionHistorial> {
    const filtros = limpiar(crudos)
    const pagina = numeroDePagina(crudos.pagina)
    const filas = listarSesiones(this.base, filtros, POR_PAGINA, (pagina - 1) * POR_PAGINA)
    return {
      total: contarSesiones(this.base, filtros),
      pagina,
      porPagina: POR_PAGINA,
      filas: filas.map((s) => ({
        id: s.id,
        agente: s.agente,
        contacto: s.contacto,
        sinNombre: telefonoDe(s.contacto) !== null,
        inicio: s.inicio,
        fin: s.fin,
        duracion: s.duracion ?? ahora() - s.inicio,
        abierta: s.estado === 'open'
      }))
    }
  }

  eventos(crudos: FiltrosCrudos): Pagina<EventoHistorial> {
    const filtros = limpiar(crudos)
    const pagina = numeroDePagina(crudos.pagina)
    const filas = listarEventos(this.base, filtros, POR_PAGINA, (pagina - 1) * POR_PAGINA)
    return {
      total: contarEventos(this.base, filtros),
      pagina,
      porPagina: POR_PAGINA,
      filas: filas.map((e) => ({
        id: e.id,
        cuando: e.cuando,
        tipo: e.tipo,
        agentes: e.participantes ? e.participantes.split(', ') : [e.agente],
        contacto: e.contacto,
        sinNombre: e.contacto !== null && telefonoDe(e.contacto) !== null,
        duracion: e.tipo === 'chat_end' ? e.duracion : null,
        motivo: e.tipo === 'disconnected' ? e.detalle : null
      }))
    }
  }
}

// Texto -> filtros. Lo que no es válido se ignora (queda sin filtro).
function limpiar(c: FiltrosCrudos): FiltrosHistorial {
  const entero = (texto?: string | null): number | null => {
    const n = Number(texto)
    return texto && Number.isInteger(n) ? n : null
  }
  const contacto = (c.contacto ?? '').trim().slice(0, 100)
  return {
    agente: entero(c.agente),
    contacto: contacto || null,
    desde: entero(c.desde),
    hasta: entero(c.hasta)
  }
}

function numeroDePagina(texto?: string | null): number {
  const n = Number(texto)
  return Number.isInteger(n) && n >= 1 ? n : 1
}
