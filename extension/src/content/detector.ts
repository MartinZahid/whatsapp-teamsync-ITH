// Detector del chat abierto en WhatsApp Web.
//
// WhatsApp cambia el título del encabezado cada vez que abres otra conversación.
// No hay un evento oficial, así que observamos el DOM con un MutationObserver y,
// cuando algo cambia, leemos el título. Para no reaccionar a cada pequeño cambio
// de la interfaz, esperamos un momento (debounce) antes de avisar.
//
// Los selectores son configurables desde Opciones (ver lib/storage.ts), porque
// WhatsApp puede cambiar su HTML con las actualizaciones.

import { getSelectors } from '../lib/storage'

export interface DetectorOptions {
  // Se llama solo cuando el chat cambió (o se cerró, con null).
  onChange: (contact: string | null) => void
  // Tiempo de espera tras una mutación, en milisegundos.
  debounceMs?: number
}

export interface Detector {
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

  // Lee el nombre del contacto del encabezado; null si no hay chat abierto.
  const readContact = (): string | null => {
    if (!selector) return null
    try {
      const element = document.querySelector(selector)
      const title = element?.getAttribute('title')?.trim()
      const text = element?.textContent?.trim()
      return title || text || null
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
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      observer?.disconnect()
    }
  }
}
