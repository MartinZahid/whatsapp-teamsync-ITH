// CONSUMO DE LA API — reportes (server/src/transporte/api/reportes.ts).

import { pedir } from './comun.js'

// `desde` y `hasta` en segundos Unix ('' = sin límite).
// Responde { resumen, porDia, porAgente, porHora, topContactos }.
export function obtenerReportes(desde, hasta) {
  const p = new URLSearchParams()
  if (desde !== '') p.set('desde', desde)
  if (hasta !== '') p.set('hasta', hasta)
  return pedir('GET', `/api/portal/reportes?${p}`)
}
