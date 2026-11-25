// Comportamiento de la página Contactos.
//
// Por ahora solo maneja la pantalla: el filtro Todos / Sin nombre, el
// buscador y la ventana para editar el nombre y el número. Todavía no habla
// con el servidor; cuando exista la API, aquí se pedirán los contactos y se
// guardarán los cambios.

const filas = document.getElementById('filas-contactos')
const botonTodos = document.getElementById('ver-todos')
const botonSinNombre = document.getElementById('ver-sin-nombre')
const buscador = document.getElementById('buscar-contacto')
const ventana = document.getElementById('ventana-contacto')

// ---------- Filtro y buscador ----------
let soloSinNombre = false

// Muestra solo las filas que cumplen el filtro y lo que se escribió en el buscador.
function aplicarFiltros() {
  const texto = buscador.value.trim().toLowerCase()

  for (const fila of filas.rows) {
    const { nombre, numero, whatsapp } = fila.dataset
    const cumpleFiltro = !soloSinNombre || nombre === ''
    const cumpleTexto = `${nombre} ${numero} ${whatsapp}`.toLowerCase().includes(texto)
    fila.hidden = !(cumpleFiltro && cumpleTexto)
  }

  botonTodos.setAttribute('aria-pressed', String(!soloSinNombre))
  botonSinNombre.setAttribute('aria-pressed', String(soloSinNombre))
}

botonTodos.addEventListener('click', () => {
  soloSinNombre = false
  aplicarFiltros()
})

botonSinNombre.addEventListener('click', () => {
  soloSinNombre = true
  aplicarFiltros()
})

buscador.addEventListener('input', aplicarFiltros)

// ---------- Ventana de editar ----------
// "Editar" y "Poner nombre" abren la misma ventana con los datos de su fila.
filas.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-accion="editar"]')
  if (!boton) return

  const { nombre, numero, whatsapp } = boton.closest('tr').dataset
  document.getElementById('contacto-whatsapp').textContent = whatsapp
  document.getElementById('contacto-nombre').value = nombre
  document.getElementById('contacto-numero').value = numero
  ventana.showModal()
})

// Al cerrar la ventana, `returnValue` trae "guardar" o "cancelar".
// Pendiente: mandar el cambio al servidor cuando exista la API.
