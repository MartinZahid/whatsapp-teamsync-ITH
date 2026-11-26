// CONSUMO DE LA API — Historial (server/src/transporte/api/historial.ts).
//
// `filtros` = { agente, contacto, desde, hasta } (los vacíos no se mandan).
// Responden { total, pagina, porPagina, filas }.

import { pedir } from './comun.js'

const API = '/api/portal/historial'

export function listarSesiones(filtros, pagina) {
  return pedir('GET', `${API}/sesiones?${parametros(filtros, pagina)}`)
}

export function listarEventos(filtros, pagina) {
  return pedir('GET', `${API}/eventos?${parametros(filtros, pagina)}`)
}

// { agente: '3', contacto: '' } + 2 -> "agente=3&pagina=2"
function parametros(filtros, pagina) {
  const p = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== null && valor !== undefined) p.set(nombre, valor)
  }
  p.set('pagina', pagina)
  return p.toString()
}
