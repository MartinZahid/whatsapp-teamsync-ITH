// Comportamiento de la página Contactos.
//
// GUÍA DE LECTURA:
//   Este archivo solo maneja la pantalla. Lo que habla con el servidor está en
//   js/consumo/contactos.js.
//   1. Al abrir pide los contactos y llena la tabla y los contadores.
//   2. El filtro Todos / Sin nombre y el buscador solo ocultan filas (no
//      vuelven a pedir nada al servidor).
//   3. "Editar" y "Poner nombre" abren la ventana; al guardar se manda el
//      cambio y se recarga la lista. Si el servidor lo rechaza, el mensaje
//      se muestra en la ventana y esta no se cierra.

import { editarContacto, listarContactos } from './consumo/contactos.js'

const ICONO_EDITAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'

const filas = document.getElementById('filas-contactos')
const botonTodos = document.getElementById('ver-todos')
const botonSinNombre = document.getElementById('ver-sin-nombre')
const buscador = document.getElementById('buscar-contacto')
const ventana = document.getElementById('ventana-contacto')
const mensajeError = ventana.querySelector('.mensaje-error')

let contactos = []        // última lista que mandó el servidor
let seleccionado = null   // contacto de la ventana abierta
let soloSinNombre = false

// ---------- Cargar del servidor ----------

async function cargar() {
  try {
    contactos = await listarContactos()
    pintar()
  } catch {
    filas.innerHTML = filaVacia('Sin conexión con el servidor.')
  }
}

// ---------- Pintar la tabla ----------

function pintar() {
  filas.innerHTML = contactos.map(fila).join('') || filaVacia('Todavía no hay contactos. Aparecen cuando un agente abre un chat.')
  document.getElementById('total-todos').textContent = contactos.length
  document.getElementById('total-sin-nombre').textContent = contactos.filter((c) => c.sinNombre).length
  aplicarFiltros()
}

// Cada fila guarda en data-* lo que usa el filtro y el buscador.
function fila(c) {
  const numero = formatoTelefono(c.telefono)
  return `
    <tr data-id="${c.id}" data-sin-nombre="${c.sinNombre}" data-texto="${escapar(`${c.nombre} ${c.enWhatsapp} ${c.telefono ?? ''}`.toLowerCase())}">
      <td${c.sinNombre ? '' : ' class="nombre"'}>${c.sinNombre ? '<span class="etiqueta etiqueta-gris">Sin nombre</span>' : escapar(c.nombre)}</td>
      <td class="hora">${numero ? escapar(numero) : '—'}</td>
      <td class="detalle">${escapar(c.enWhatsapp)}</td>
      <td class="hora">${c.sesiones}</td>
      <td>${ultimaVez(c.ultimaVez)}</td>
      <td class="acciones">${c.sinNombre
        ? '<button class="boton boton-chico" type="button" data-accion="editar">Poner nombre</button>'
        : `<button class="boton-icono" type="button" data-accion="editar" aria-label="Editar a ${escapar(c.nombre)}">${ICONO_EDITAR}</button>`}
      </td>
    </tr>`
}

// ---------- Filtro y buscador ----------

// Muestra solo las filas que cumplen el filtro y lo que se escribió en el buscador.
function aplicarFiltros() {
  const texto = buscador.value.trim().toLowerCase()
  const digitos = texto.replace(/\D/g, '')

  for (const tr of filas.querySelectorAll('tr[data-id]')) {
    const cumpleFiltro = !soloSinNombre || tr.dataset.sinNombre === 'true'
    // Por texto, o por número aunque se escriba con espacios ("662 184").
    const cumpleTexto = tr.dataset.texto.includes(texto) ||
      (digitos !== '' && tr.dataset.texto.replace(/\D/g, '').includes(digitos))
    tr.hidden = !(cumpleFiltro && cumpleTexto)
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

// "Editar" y "Poner nombre" abren la misma ventana con los datos del contacto.
filas.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-accion="editar"]')
  if (!boton) return
  seleccionado = contactos.find((c) => c.id === Number(boton.closest('tr').dataset.id))
  if (!seleccionado) return

  document.getElementById('contacto-whatsapp').textContent = seleccionado.enWhatsapp
  document.getElementById('contacto-nombre').value = seleccionado.sinNombre ? '' : seleccionado.nombre
  document.getElementById('contacto-numero').value = formatoTelefono(seleccionado.telefono)
  mensajeError.hidden = true
  ventana.showModal()
})

// Guardar manda el cambio; la ventana se cierra solo si salió bien.
// "Cancelar" la cierra sin mandar nada.
ventana.querySelector('form').addEventListener('submit', async (evento) => {
  if (evento.submitter?.value === 'cancelar') return
  evento.preventDefault()
  const datos = new FormData(evento.target)
  try {
    await editarContacto(seleccionado.id, datos.get('nombre'), datos.get('numero'))
    ventana.close()
    await cargar()
  } catch (e) {
    mensajeError.textContent = e.message
    mensajeError.hidden = false
  }
})

// ---------- Ayudantes ----------

// "526621843920" -> "+52 662 184 3920", "15551234567" -> "+1 555 123 4567";
// otros números: "+" y los dígitos.
function formatoTelefono(digitos) {
  if (!digitos) return ''
  if (digitos.length === 12 && digitos.startsWith('52')) {
    return `+52 ${digitos.slice(2, 5)} ${digitos.slice(5, 8)} ${digitos.slice(8)}`
  }
  if (digitos.length === 11 && digitos.startsWith('1')) {
    return `+1 ${digitos.slice(1, 4)} ${digitos.slice(4, 7)} ${digitos.slice(7)}`
  }
  if (digitos.length === 10) return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`
  return `+${digitos}`
}

// Segundos Unix -> "Hoy 10:17" o "19/11 10:17" (hora local)
function ultimaVez(segundos) {
  const fecha = new Date(segundos * 1000)
  const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  if (fecha.toDateString() === new Date().toDateString()) return `Hoy ${hora}`
  return `${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })} ${hora}`
}

function filaVacia(texto) {
  return `<tr><td colspan="6" class="nota">${texto}</td></tr>`
}

// Evita que un nombre con "<" o "&" rompa la tabla.
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// ---------- Arranque ----------
cargar()
