// CONSUMO DE LA API — ayudante que usan todos los archivos de esta carpeta.
//
// pedir() es el ÚNICO lugar del portal que hace `fetch` al servidor.
// Devuelve la respuesta en JSON. Si el servidor responde con error, lanza un
// Error con su mensaje (p. ej. "Ya hay un agente activo llamado ...").

export async function pedir(metodo, ruta, datos) {
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: datos ? { 'Content-Type': 'application/json' } : undefined,
    body: datos ? JSON.stringify(datos) : undefined
  })
  const cuerpo = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) throw new Error(cuerpo.error || 'No se pudo completar la acción')
  return cuerpo
}
