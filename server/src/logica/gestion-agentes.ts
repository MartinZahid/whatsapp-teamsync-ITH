// CAPA 2 · LÓGICA — gestión de agentes desde el portal (alta, edición, baja,
// reactivar). ADR-001: los agentes se gestionan desde el dashboard.
//
// GUÍA DE LECTURA:
//   Cada acción hace dos cosas:
//     1. Revisa las reglas y guarda en la base (capa de datos).
//     2. Pone al día la presencia en vivo (RoomManager), para que la extensión
//        y el portal vean el cambio sin reiniciar el servidor.
//   Si algo no se puede, devuelve un error con su código HTTP y un mensaje
//   para mostrar en el portal.
//   El número de empleado se guarda en `agents.agent_id`.

import type { AgentStatus } from '../../../shared/types.js'
import {
  actualizarAgente,
  buscarAgentePorEmpleado,
  buscarAgentePorId,
  buscarAgentePorNombre,
  buscarOCrearAgente,
  darDeBajaAgente,
  listarTodosLosAgentes,
  reactivarAgente
} from '../datos/agentes.js'
import type { BaseDeDatos } from '../datos/conexion.js'
import type { RoomManager } from './room-manager.js'

// Un agente tal como lo muestra el portal.
export interface AgentePortal {
  id: number
  empleado: string
  nombre: string
  activo: boolean
  alta: number                     // fecha de alta (segundos Unix)
  estado: AgentStatus              // de la presencia en vivo
  conversacion: string | null
  atendiendoDesde: number | null   // milisegundos (Date.now())
}

// null = todo bien; si no, el código HTTP y el mensaje para el usuario.
export type ErrorGestion = { codigo: 400 | 404 | 409; mensaje: string } | null

export class GestionAgentes {
  constructor(
    private readonly base: BaseDeDatos,
    private readonly sala: RoomManager
  ) {}

  // Todos los agentes de la base, con su estado en vivo.
  listar(): AgentePortal[] {
    const enVivo = this.sala.getAllAgents()
    return listarTodosLosAgentes(this.base).map((fila) => {
      const vivo = fila.active ? enVivo.find((a) => a.name === fila.name) : undefined
      return {
        id: fila.id,
        empleado: fila.agentId,
        nombre: fila.name,
        activo: fila.active === 1,
        alta: fila.createdAt,
        estado: vivo?.status ?? 'offline',
        conversacion: vivo?.contact ?? null,
        atendiendoDesde: vivo?.attendingSince ?? null
      }
    })
  }

  alta(empleado: unknown, nombre: unknown): ErrorGestion {
    const datos = this.validar(empleado, nombre, null)
    if ('codigo' in datos) return datos
    buscarOCrearAgente(this.base, datos.nombre, datos.empleado)
    this.sala.agregarAgente(datos.nombre)
    return null
  }

  // Si el agente está activo, se saca de la presencia (si estaba conectado se
  // le cierra la conexión) y se vuelve a cargar con sus datos nuevos: tiene que
  // volver a elegir su nombre en la extensión. Su historial no se pierde.
  editar(id: number, empleado: unknown, nombre: unknown): ErrorGestion {
    const agente = buscarAgentePorId(this.base, id)
    if (!agente) return { codigo: 404, mensaje: 'El agente no existe' }
    const datos = this.validar(empleado, nombre, id)
    if ('codigo' in datos) return datos
    if (datos.empleado === agente.agentId && datos.nombre === agente.name) return null // sin cambios

    if (agente.active) this.sala.darDeBaja(agente.name)
    actualizarAgente(this.base, id, datos.empleado, datos.nombre)
    if (agente.active) {
      reactivarAgente(this.base, id) // darDeBaja lo había marcado inactivo
      this.sala.agregarAgente(datos.nombre)
    }
    return null
  }

  // Baja lógica: pasa a Inactivos; su historial y reportes se conservan.
  baja(id: number): ErrorGestion {
    const agente = buscarAgentePorId(this.base, id)
    if (!agente) return { codigo: 404, mensaje: 'El agente no existe' }
    if (!agente.active) return null
    // darDeBaja cierra su conexión y su sesión, y lo marca inactivo en la base.
    if (!this.sala.darDeBaja(agente.name)) darDeBajaAgente(this.base, id)
    return null
  }

  reactivar(id: number): ErrorGestion {
    const agente = buscarAgentePorId(this.base, id)
    if (!agente) return { codigo: 404, mensaje: 'El agente no existe' }
    if (agente.active) return null
    if (buscarAgentePorNombre(this.base, agente.name)) {
      return { codigo: 409, mensaje: `Ya hay un agente activo llamado "${agente.name}"` }
    }
    reactivarAgente(this.base, id)
    this.sala.agregarAgente(agente.name)
    return null
  }

  // Reglas comunes de alta y edición. `id` = el agente que se edita (null en alta).
  private validar(
    empleado: unknown,
    nombre: unknown,
    id: number | null
  ): { empleado: string; nombre: string } | { codigo: 400 | 409; mensaje: string } {
    const e = typeof empleado === 'string' ? empleado.trim() : ''
    const n = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
    if (!e || !n) return { codigo: 400, mensaje: 'Escribe el número de empleado y el nombre' }

    const mismoNombre = buscarAgentePorNombre(this.base, n)
    if (mismoNombre && mismoNombre.id !== id) {
      return { codigo: 409, mensaje: `Ya hay un agente activo llamado "${n}"` }
    }
    const mismoNumero = buscarAgentePorEmpleado(this.base, e)
    if (mismoNumero && mismoNumero.id !== id) {
      return { codigo: 409, mensaje: `El número de empleado ${e} ya es de ${mismoNumero.name}` }
    }
    return { empleado: e, nombre: n }
  }
}
