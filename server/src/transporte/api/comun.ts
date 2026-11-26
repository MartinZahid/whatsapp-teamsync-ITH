// CAPA 1 · TRANSPORTE — ayudantes que usan todas las APIs del portal.

import type { IncomingMessage, ServerResponse } from 'node:http'

// Responde con JSON y el código HTTP indicado.
export function responder(res: ServerResponse, codigo: number, datos: unknown): void {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(datos))
}

// Lee el cuerpo de la petición como JSON. Si no es JSON válido, devuelve {}
// (y la validación de la lógica responde "faltan datos").
export async function leerJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let texto = ''
  for await (const trozo of req) {
    texto += trozo
    if (texto.length > 10_000) break // ninguna pantalla del portal manda tanto
  }
  try {
    const datos = JSON.parse(texto)
    return typeof datos === 'object' && datos !== null ? datos : {}
  } catch {
    return {}
  }
}
