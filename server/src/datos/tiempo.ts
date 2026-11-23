// Fechas de la base de datos: Unix epoch en SEGUNDOS (UTC).
// (Date.now() da milisegundos; aquí se convierte una sola vez.)
export function ahora(): number {
  return Math.floor(Date.now() / 1000)
}