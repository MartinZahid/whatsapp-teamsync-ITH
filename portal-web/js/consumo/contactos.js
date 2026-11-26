// CONSUMO DE LA API — contactos (server/src/transporte/api/contactos.ts).

import { pedir } from './comun.js'

const API = '/api/portal/contactos'

// Todos: [{ id, nombre, sinNombre, telefono, enWhatsapp, sesiones, ultimaVez }].
export function listarContactos() {
  return pedir('GET', API)
}

// Ponerle nombre y número (el número puede ir vacío).
export function editarContacto(id, nombre, numero) {
  return pedir('PUT', `${API}/${id}`, { nombre, numero })
}
