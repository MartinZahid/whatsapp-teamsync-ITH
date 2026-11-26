// Comportamiento de la página En vivo.
//
// GUÍA DE LECTURA:
//   Este archivo solo maneja la pantalla. Lo que habla con el servidor está en
//   js/consumo/ (agentes.js y avisos.js).
//   1. Pide al servidor los agentes, las solicitudes de ayuda y las alertas de
//      duplicidad de hoy al abrir la página y cada 5 s, y llena las tablas, los
//      contadores y los avisos.
//   2. Las ventanas de agregar, editar y eliminar, y el botón Reactivar, mandan
//      el cambio al servidor y vuelven a cargar la lista.
//   3. Si el servidor rechaza algo (nombre o número repetido, faltan datos), el
//      mensaje se muestra dentro de la ventana y esta no se cierra.

import {
  agregarAgente,
  editarAgente,
  eliminarAgente,
  listarAgentes,
  reactivarAgente
} from './consumo/agentes.js'
import { listarAyuda, listarDuplicidades } from './consumo/avisos.js'

const CADA_MS = 5000

const ESTADOS = {
  attending: { texto: 'Atendiendo', clase: 'estado-atendiendo' },
  available: { texto: 'Disponible', clase: 'estado-disponible' },
  paused: { texto: 'Pausado', clase: 'estado-pausado' },
  offline: { texto: 'Desconectado', clase: 'estado-desconectado' }
}

const ICONO_EDITAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
const ICONO_ELIMINAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
const ICONO_AYUDA = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>'
const ICONO_DUPLICIDAD = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>'
const ICONO_REACTIVAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>'

let agentes = []        // última lista que mandó el servidor
let seleccionado = null // agente de la ventana abierta (editar o eliminar)

// ---------- Cargar del servidor ----------

async function cargar() {
  const nota = document.getElementById('ultima-actualizacion')
  try {
    const [lista, ayuda, duplicidades] = await Promise.all([
      listarAgentes(),
      listarAyuda(),
      listarDuplicidades(inicioDeHoy())
    ])
    agentes = lista
    pintar()
    pintarAvisos(ayuda, duplicidades)
    nota.textContent = `Se actualiza solo · ${new Date().toLocaleTimeString('es-MX')}`
  } catch {
    nota.textContent = 'Sin conexión con el servidor'
  }
}

// ---------- Pintar las tablas y los contadores ----------

function pintar() {
  const activos = agentes.filter((a) => a.activo)
  const inactivos = agentes.filter((a) => !a.activo)

  document.getElementById('filas-activos').innerHTML =
    activos.map(filaActivo).join('') || filaVacia(6, 'No hay agentes activos. Agrega uno con "Agregar agente".')
  document.getElementById('filas-inactivos').innerHTML =
    inactivos.map(filaInactivo).join('') || filaVacia(5, 'No hay agentes inactivos.')

  const cuantos = (estado) => activos.filter((a) => a.estado === estado).length
  escribir('total-conectados', activos.length - cuantos('offline'))
  escribir('total-atendiendo', cuantos('attending'))
  escribir('total-disponibles', cuantos('available'))
  escribir('total-pausados', cuantos('paused'))
  escribir('total-activos', activos.length)
  escribir('total-inactivos', inactivos.length)
}

function filaActivo(a) {
  const estado = ESTADOS[a.estado] ?? ESTADOS.offline
  return `
    <tr data-id="${a.id}">
      <td class="numero">${escapar(a.empleado)}</td>
      <td class="nombre">${escapar(a.nombre)}</td>
      <td><span class="estado ${estado.clase}">${estado.texto}</span></td>
      <td>${a.conversacion ? escapar(a.conversacion) : '—'}</td>
      <td class="tiempo">${a.atendiendoDesde ? duracion(Date.now() - a.atendiendoDesde) : '—'}</td>
      <td class="acciones solo-gestion">
        <button class="boton-icono" type="button" data-accion="editar" aria-label="Editar a ${escapar(a.nombre)}">${ICONO_EDITAR}</button>
        <button class="boton-icono" type="button" data-accion="eliminar" aria-label="Eliminar a ${escapar(a.nombre)}">${ICONO_ELIMINAR}</button>
      </td>
    </tr>`
}

function filaInactivo(a) {
  return `
    <tr data-id="${a.id}">
      <td class="numero">${escapar(a.empleado)}</td>
      <td class="nombre">${escapar(a.nombre)}</td>
      <td><span class="estado estado-inactivo">Inactivo</span></td>
      <td>${new Date(a.alta * 1000).toLocaleDateString('es-MX')}</td>
      <td class="acciones solo-gestion">
        <button class="boton-icono" type="button" data-accion="editar" aria-label="Editar a ${escapar(a.nombre)}">${ICONO_EDITAR}</button>
        <button class="boton boton-secundario" type="button" data-accion="reactivar">${ICONO_REACTIVAR} Reactivar</button>
      </td>
    </tr>`
}

// ---------- Pintar los avisos (ayuda y duplicidad) ----------

function pintarAvisos(ayuda, duplicidades) {
  document.getElementById('lista-ayuda').innerHTML =
    ayuda.map(avisoAyuda).join('') || '<p class="nota">Nadie está pidiendo ayuda.</p>'
  document.getElementById('lista-duplicidad').innerHTML =
    duplicidades.map(avisoDuplicidad).join('') || '<p class="nota">Sin alertas de duplicidad hoy.</p>'
}

function avisoAyuda(s) {
  const detalle = s.conversacion ? `Atendiendo a ${escapar(s.conversacion)}` : (ESTADOS[s.estado] ?? ESTADOS.offline).texto
  return `
    <div class="aviso aviso-ayuda">
      ${ICONO_AYUDA}
      <div>
        <strong>${escapar(s.agente)}</strong>
        <span>${detalle}</span>
      </div>
      <time>${s.desde ? hora(s.desde) : ''}</time>
    </div>`
}

function avisoDuplicidad(a) {
  return `
    <div class="aviso aviso-duplicidad">
      ${ICONO_DUPLICIDAD}
      <div>
        <strong>${escapar(a.contacto ?? 'Chat sin nombre')}</strong>
        <span>${escapar(unirNombres(a.agentes))} en el mismo chat</span>
      </div>
      <time>${hora(a.cuando)}</time>
    </div>`
}

// ["Ana", "Luis", "Pedro"] -> "Ana, Luis y Pedro"
function unirNombres(nombres) {
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres.join('')
}

// Segundos Unix -> "11:42" (hora local)
function hora(segundos) {
  return new Date(segundos * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Inicio del día de hoy (hora local), en segundos Unix.
function inicioDeHoy() {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.floor(hoy.getTime() / 1000)
}

function filaVacia(columnas, texto) {
  return `<tr><td colspan="${columnas}" class="nota">${texto}</td></tr>`
}

// Milisegundos -> "00:12:48"
function duracion(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const dos = (n) => String(n).padStart(2, '0')
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`
}

function escribir(id, valor) {
  document.getElementById(id).textContent = valor
}

// Los nombres vienen de los usuarios: se escapan para que no se tomen como HTML.
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

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

function abrir(ventana) {
  ventana.querySelector('.mensaje-error').hidden = true
  ventana.showModal()
}

// Agregar: abre la ventana con los campos vacíos.
document.getElementById('abrir-agregar').addEventListener('click', () => {
  ventanaAgregar.querySelector('form').reset()
  abrir(ventanaAgregar)
})

// Editar, eliminar y reactivar: un solo escuchador para las dos tablas.
// El botón dice qué hacer (data-accion) y su fila trae el id (data-id).
document.addEventListener('click', async (evento) => {
  const boton = evento.target.closest('[data-accion]')
  if (!boton) return
  seleccionado = agentes.find((a) => a.id === Number(boton.closest('tr').dataset.id))
  if (!seleccionado) return

  switch (boton.dataset.accion) {
    case 'editar':
      document.getElementById('editar-empleado').value = seleccionado.empleado
      document.getElementById('editar-nombre').value = seleccionado.nombre
      abrir(ventanaEditar)
      break
    case 'eliminar':
      document.getElementById('eliminar-nombre').textContent = seleccionado.nombre
      abrir(ventanaEliminar)
      break
    case 'reactivar':
      try {
        await reactivarAgente(seleccionado.id)
        await cargar()
      } catch (error) {
        alert(error.message)
      }
      break
  }
})

// Al confirmar una ventana se manda el cambio al servidor. La ventana se
// cierra solo si salió bien; si no, muestra el mensaje del servidor.
// "Cancelar" la cierra sin mandar nada.
function alConfirmar(ventana, accion) {
  const formulario = ventana.querySelector('form')
  const error = ventana.querySelector('.mensaje-error')
  formulario.addEventListener('submit', async (evento) => {
    if (evento.submitter?.value === 'cancelar') return
    evento.preventDefault()
    try {
      await accion(new FormData(formulario))
      ventana.close()
      await cargar()
    } catch (e) {
      error.textContent = e.message
      error.hidden = false
    }
  })
}

alConfirmar(ventanaAgregar, (datos) => agregarAgente(datos.get('empleado'), datos.get('nombre')))
alConfirmar(ventanaEditar, (datos) => editarAgente(seleccionado.id, datos.get('empleado'), datos.get('nombre')))
alConfirmar(ventanaEliminar, () => eliminarAgente(seleccionado.id))

// ---------- Arranque ----------
cargar()
setInterval(cargar, CADA_MS)
