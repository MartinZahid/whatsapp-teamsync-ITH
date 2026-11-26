// Detecta cuando el agente ESCRIBE en la caja de mensaje del chat abierto.
//
// Se usa para la duplicidad (RN-07): ya no basta con abrir un chat, cuenta
// cuando dos agentes escriben en él. Escuchamos el evento `input` de la página
// y revisamos si ocurrió dentro de la caja de mensaje.
//
// WhatsApp puede cambiar su HTML: si deja de detectar, ajustar el selector.

// Caja donde se escribe el mensaje (abajo del chat).
const CAJA_DE_MENSAJE = 'footer [contenteditable="true"]'
// No avisar más de una vez cada 5 s (el service worker además manda solo
// UN aviso por chat al servidor).
const ESPERA_MS = 5000

export interface Escritura {
  // Al cambiar de chat: permite avisar de inmediato en el chat nuevo.
  reiniciar: () => void
}

export function vigilarEscritura(alEscribir: () => void): Escritura {
  let ultimoAviso = 0

  document.addEventListener(
    'input',
    (evento) => {
      const objetivo = evento.target
      if (!(objetivo instanceof Element) || !objetivo.closest(CAJA_DE_MENSAJE)) return
      const ahora = Date.now()
      if (ahora - ultimoAviso < ESPERA_MS) return
      ultimoAviso = ahora
      alEscribir()
    },
    true // fase de captura: lo vemos aunque WhatsApp detenga el evento
  )

  return {
    reiniciar: () => {
      ultimoAviso = 0
    }
  }
}
