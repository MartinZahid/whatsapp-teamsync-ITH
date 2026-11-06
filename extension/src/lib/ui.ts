// Utilidades de interfaz compartidas por el panel flotante y el popup.
import type { ConnectionState } from './storage'

type Connection = ConnectionState['status']

// Dos letras para el avatar (por ejemplo "Ana Torres" -> "AT").
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

// Texto de la conexión con el servidor.
export const CONNECTION_LABELS: Record<Connection, string> = {
  connected: 'Conectado al servidor',
  connecting: 'Conectando al servidor…',
  disconnected: 'Sin conexión con el servidor'
}

// Texto del aviso de duplicidad (RN-07).
export function duplicateText(contact: string, names: string[]): string {
  return `Atención duplicada: "${contact}" (${names.join(', ')})`
}

// Cuánto tiempo se muestra el aviso de duplicidad.
export const ALERT_MS = 8000
