// Comprueba si se puede abrir una conexión WebSocket con el servidor.
// Se usa en el popup y en la página de opciones.
export function testConnection(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false
    let ws: WebSocket | null = null

    const finish = (ok: boolean) => {
      if (finished) return
      finished = true
      try {
        ws?.close()
      } catch {
        // ya estaba cerrada
      }
      resolve(ok)
    }

    try {
      ws = new WebSocket(url)
    } catch {
      resolve(false)
      return
    }

    ws.addEventListener('open', () => finish(true))
    ws.addEventListener('error', () => finish(false))
    setTimeout(() => finish(false), timeoutMs)
  })
}
