// CONSUMO DE LA API — avisos de En vivo (server/src/transporte/api/avisos.ts).

import { pedir } from './comun.js'

const API = '/api/portal/avisos'

// Quién pide ayuda ahora: [{ agente, estado, conversacion, desde }].
export function listarAyuda() {
  return pedir('GET', `${API}/ayuda`)
}

// Alertas de duplicidad desde `desde` (segundos Unix): [{ id, contacto, agentes, cuando }].
export function listarDuplicidades(desde) {
  return pedir('GET', `${API}/duplicidades?desde=${desde}`)
}
