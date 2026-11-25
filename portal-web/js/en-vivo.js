// Comportamiento de la página En vivo.
//
// Por ahora solo maneja la pantalla: el filtro Activos / Inactivos y las
// ventanas de agregar, editar y eliminar. Todavía no habla con el servidor;
// cuando exista la API, aquí se pedirán los agentes y se guardarán los cambios.

// ---------- Filtro Activos / Inactivos ----------
const tablaActivos = document.getElementById('tabla-activos')
const tablaInactivos = document.getElementById('tabla-inactivos')
const botonActivos = document.getElementById('ver-activos')
const botonInactivos = document.getElementById('ver-inactivos')

function mostrarTabla(verInactivos) {
  tablaActivos.hidden = verInactivos
  tablaInactivos.hidden = !verInactivos
  botonActivos.setAttribute('aria-pressed', String(!verInactivos))
  botonInactivos.setAttribute('aria-pressed', String(verInactivos))
}

botonActivos.addEventListener('click', () => mostrarTabla(false))
botonInactivos.addEventListener('click', () => mostrarTabla(true))

// ---------- Ventanas ----------
const ventanaAgregar = document.getElementById('ventana-agregar')
const ventanaEditar = document.getElementById('ventana-editar')
const ventanaEliminar = document.getElementById('ventana-eliminar')

// Agregar: abre la ventana con los campos vacíos.
document.getElementById('abrir-agregar').addEventListener('click', () => {
  ventanaAgregar.querySelector('form').reset()
  ventanaAgregar.showModal()
})

// Editar, eliminar y reactivar: un solo escuchador para las dos tablas.
// El botón dice qué hacer (data-accion) y su fila trae los datos del agente
// (data-empleado, data-nombre).
document.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-accion]')
  if (!boton) return

  const { empleado, nombre } = boton.closest('tr').dataset

  switch (boton.dataset.accion) {
    case 'editar':
      document.getElementById('editar-empleado').value = empleado
      document.getElementById('editar-nombre').value = nombre
      ventanaEditar.showModal()
      break
    case 'eliminar':
      document.getElementById('eliminar-nombre').textContent = nombre
      ventanaEliminar.showModal()
      break
    case 'reactivar':
      // Pendiente: pedir al servidor que reactive al agente.
      break
  }
})

// Al cerrar una ventana, `returnValue` trae el botón que se usó
// ("agregar", "guardar", "eliminar" o "cancelar").
// Pendiente: mandar el cambio al servidor cuando exista la API.
