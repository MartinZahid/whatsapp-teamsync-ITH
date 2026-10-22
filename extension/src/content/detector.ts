// Detector del chat abierto en WhatsApp Web.
//
// WhatsApp cambia el nombre del contacto en el encabezado de la conversación
// cada vez que abres otro chat. No hay un evento oficial, así que observamos el
// DOM con un MutationObserver y, cuando algo cambia, leemos ese nombre. Para no
// reaccionar a cada pequeño cambio de la interfaz, esperamos un momento
// (debounce) antes de avisar.
//
// Los selectores son configurables desde Opciones (ver lib/storage.ts), porque
// WhatsApp puede cambiar su HTML con las actualizaciones.

import { getSelectors } from '../lib/storage'

// Panel de la conversación: sirve para saber si hay un chat abierto.
const PANEL_SELECTOR = 'div[data-testid="conversation-panel-wrapper"]'

export interface DetectorOptions {
  // Se llama solo cuando el chat cambió (o se cerró, con null).
  onChange: (contact: string | null) => void
  // Tiempo de espera tras una mutación, en milisegundos.
  debounceMs?: number
}

export interface Detector {
  // Vuelve a avisar del chat actual, aunque no haya cambiado.
  refresh: () => void
  stop: () => void
}

export function startDetector(options: DetectorOptions): Detector {
  const debounceMs = options.debounceMs ?? 600

  let selector = ''
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let observer: MutationObserver | null = null
  // `undefined` = todavía no se ha avisado nada; `null` = no hay chat abierto.
  let last: string | null | undefined = undefined
  // Último nombre leído, para no perderlo mientras el encabezado se redibuja.
  let lastContact: string | null = null

  // Lee el nombre del contacto del encabezado; null si no hay chat abierto.
  const readContact = (): string | null => {
    if (!selector) return null
    try {
      const element = document.querySelector(selector)
      const text = element?.textContent?.trim()
      const title = element?.getAttribute('title')?.trim()
      const name = text || title || null

      if (name) {
        lastContact = name
        return name
      }

      // El panel sigue abierto pero el título aún no se dibujó: conservamos el
      // último nombre para no marcar al agente como Disponible por un instante.
      if (document.querySelector(PANEL_SELECTOR)) return lastContact

      lastContact = null
      return null
    } catch {
      // Selector inválido configurado por el usuario: mejor no fallar.
      return null
    }
  }

  const emit = (contact: string | null): void => {
    if (contact === last) return
    last = contact
    options.onChange(contact)
  }

  const check = (): void => {
    if (stopped) return
    emit(readContact())
  }

  // Cada mutación reinicia el temporizador; solo avisamos al final del ruido.
  const schedule = (): void => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      check()
    }, debounceMs)
  }

  void getSelectors().then((selectors) => {
    if (stopped) return
    selector = selectors.chatTitle

    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    // Revisión inicial, por si la página ya tenía un chat abierto.
    check()
  })

  return {
    refresh: () => {
      last = undefined
      check()
    },
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      observer?.disconnect()
    }
  }
}
