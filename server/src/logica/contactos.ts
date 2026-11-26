// CAPA 2 · LÓGICA — pestaña Contactos del portal.
//
// GUÍA DE LECTURA:
//   - listar(): todos los contactos como los muestra el portal. "Sin nombre"
//     = el contacto sigue llamándose como un número de teléfono.
//   - editar(): ponerle nombre y número a un contacto. Es solo visual: en
//     WhatsApp sigue igual, y el chat se reconoce por cómo aparece allá.
//   Si algo no se puede, devuelve el error con su código HTTP y el mensaje.

import { normalizeContact } from '../../../shared/types.js'
import type { BaseDeDatos } from '../datos/conexion.js'
import { actualizarContacto, buscarContactoPorId, listarContactos, telefonoDe } from '../datos/contactos.js'
import type { ErrorGestion } from './gestion-agentes.js'

export interface ContactoPortal {
  id: number
  nombre: string
  sinNombre: boolean
  telefono: string | null     // solo dígitos: "526621843920"
  enWhatsapp: string          // cómo aparece el chat en WhatsApp
  sesiones: number
  ultimaVez: number           // segundos Unix
}

export class Contactos {
  constructor(private readonly base: BaseDeDatos) {}

  listar(): ContactoPortal[] {
    return listarContactos(this.base).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      sinNombre: telefonoDe(c.nombre) !== null,
      telefono: c.telefono,
      // Si no se le ha cambiado el nombre, el nombre ES como aparece en WhatsApp
      // (con sus mayúsculas). Si ya se cambió, solo queda la versión guardada
      // en minúsculas (`wa_id`).
      enWhatsapp: normalizeContact(c.nombre) === c.waId ? c.nombre : c.waId,
      sesiones: c.sesiones,
      ultimaVez: c.ultimaVez
    }))
  }

  editar(id: number, nombre: unknown, numero: unknown): ErrorGestion {
    if (!buscarContactoPorId(this.base, id)) return { codigo: 404, mensaje: 'El contacto no existe' }

    const n = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
    if (!n) return { codigo: 400, mensaje: 'Escribe el nombre del contacto' }
    if (n.length > 100) return { codigo: 400, mensaje: 'El nombre es muy largo (máximo 100 letras)' }
    if (telefonoDe(n)) return { codigo: 400, mensaje: 'Escribe un nombre, no un número' }

    // El número es opcional; si se escribe, debe parecer teléfono.
    const textoNumero = typeof numero === 'string' ? numero.trim() : ''
    const telefono = textoNumero ? telefonoDe(textoNumero) : null
    if (textoNumero && !telefono) return { codigo: 400, mensaje: 'El número no es válido (de 8 a 15 dígitos)' }

    actualizarContacto(this.base, id, n, telefono)
    return null
  }
}
