// CONSUMO DE LA API — reportes (server/src/transporte/http/api/reportes.ts).

import { pedir } from './comun.js'

// filtros = { desde, hasta, agente }: fechas en segundos Unix, agente = id.
// Los vacíos ('') no se mandan (sin límite / todos los agentes).
// Responde { resumen, porDia, porHora, porEstado, porAgente, topContactos }.
export function obtenerReportes(filtros) {
  const p = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== null && valor !== undefined) p.set(nombre, valor)
  }
  return pedir('GET', `/api/portal/reportes?${p}`)
}
