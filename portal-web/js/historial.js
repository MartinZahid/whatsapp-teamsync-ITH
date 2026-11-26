// Comportamiento de la página Historial.
//
// GUÍA DE LECTURA:
//   Este archivo solo maneja la pantalla. Lo que habla con el servidor está en
//   js/consumo/ (agentes.js e historial.js).
//   1. Al abrir: llena la lista de agentes del filtro y carga las dos tablas.
//   2. Al cambiar un filtro: vuelve a la página 1 de las dos tablas.
//      (En "Contacto" espera a que dejes de escribir un momento.)
//   3. Cada tabla tiene su paginación: 10 filas por página.
//   No se actualiza sola: es historial, no "En vivo".

import { listarAgentes } from './consumo/agentes.js'
import { listarEventos, listarSesiones } from './consumo/historial.js'

// Cómo se muestra cada tipo de evento de la bitácora.
const EVENTOS = {
  connected: { texto: 'Se conectó', clase: 'etiqueta-verde' },
  chat_start: { texto: 'Inició atención', clase: 'etiqueta-gris' },
  chat_end: { texto: 'Terminó atención', clase: 'etiqueta-gris' },
  available: { texto: 'Disponible', clase: 'etiqueta-verde' },
  paused: { texto: 'Pausó', clase: 'etiqueta-amarilla' },
  help_request: { texto: 'Pidió ayuda', clase: 'etiqueta-naranja' },
  help_cancel: { texto: 'Canceló ayuda', clase: 'etiqueta-gris' },
  duplicate_alert: { texto: 'Duplicidad', clase: 'etiqueta-roja' },
  disconnected: { texto: 'Se desconectó', clase: 'etiqueta-gris' }
}

// Motivos de desconexión que manda el servidor, en palabras del portal.
const MOTIVOS = {
  manual: 'Desde la extensión',
  'sin heartbeat': 'Sin señal por 15 s',
  'conexión cerrada': 'Cerró WhatsApp o la conexión'
}

const ICONO_ANTERIOR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
const ICONO_SIGUIENTE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'

const formulario = document.getElementById('filtros')

// ---------- Cargar del servidor ----------

async function cargarSesiones(pagina = 1) {
  try {
    const datos = await listarSesiones(filtros(), pagina)
    document.getElementById('total-sesiones').textContent = datos.total
    document.getElementById('filas-sesiones').innerHTML =
      datos.filas.map(filaSesion).join('') || filaVacia(6, 'No hay sesiones con estos filtros.')
    pintarPaginacion('paginacion-sesiones', datos, cargarSesiones)
  } catch {
    document.getElementById('filas-sesiones').innerHTML = filaVacia(6, 'Sin conexión con el servidor.')
  }
}

async function cargarEventos(pagina = 1) {
  try {
    const datos = await listarEventos(filtros(), pagina)
    document.getElementById('total-eventos').textContent = datos.total
    document.getElementById('filas-eventos').innerHTML =
      datos.filas.map(filaEvento).join('') || filaVacia(5, 'No hay eventos con estos filtros.')
    pintarPaginacion('paginacion-eventos', datos, cargarEventos)
  } catch {
    document.getElementById('filas-eventos').innerHTML = filaVacia(5, 'Sin conexión con el servidor.')
  }
}

function cargarTodo() {
  cargarSesiones(1)
  cargarEventos(1)
}

// Lista de agentes del filtro (activos e inactivos: el historial incluye a todos).
async function llenarAgentes() {
  try {
    const agentes = await listarAgentes()
    const opciones = agentes
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((a) => `<option value="${a.id}">${escapar(a.nombre)}${a.activo ? '' : ' (inactivo)'}</option>`)
    document.getElementById('filtro-agente').innerHTML = '<option value="">Todos</option>' + opciones.join('')
  } catch {
    // Sin servidor: se queda solo "Todos"; las tablas mostrarán el error.
  }
}

// ---------- Filtros ----------

// Lee el formulario. Las fechas se mandan en segundos Unix:
// "desde" = 00:00:00 de ese día y "hasta" = 23:59:59 (hora local).
function filtros() {
  const datos = new FormData(formulario)
  return {
    agente: datos.get('agente'),
    contacto: datos.get('contacto').trim(),
    desde: segundosDelDia(datos.get('desde'), 0, 0, 0),
    hasta: segundosDelDia(datos.get('hasta'), 23, 59, 59)
  }
}

// "2026-11-19" -> segundos Unix de ese día a la hora indicada. Vacío -> ''.
function segundosDelDia(texto, h, m, s) {
  if (!texto) return ''
  const [anio, mes, dia] = texto.split('-').map(Number)
  return Math.floor(new Date(anio, mes - 1, dia, h, m, s).getTime() / 1000)
}

// ---------- Pintar las filas ----------

function filaSesion(s) {
  return `
    <tr>
      <td class="nombre">${escapar(s.agente)}</td>
      <td>${contacto(s.contacto, s.sinNombre)}</td>
      <td class="hora">${fechaHora(s.inicio)}</td>
      <td class="hora">${s.fin ? hora(s.fin) : '—'}</td>
      <td class="tiempo">${duracion(s.duracion)}</td>
      <td>${s.abierta
        ? '<span class="etiqueta etiqueta-roja">Abierta</span>'
        : '<span class="etiqueta etiqueta-verde">Cerrada</span>'}</td>
    </tr>`
}

function filaEvento(e) {
  const tipo = EVENTOS[e.tipo] ?? { texto: e.tipo, clase: 'etiqueta-gris' }
  return `
    <tr>
      <td class="hora">${fechaHora(e.cuando)}</td>
      <td class="nombre">${escapar(unirNombres(e.agentes))}</td>
      <td><span class="etiqueta ${tipo.clase}">${tipo.texto}</span></td>
      <td>${e.contacto ? contacto(e.contacto, e.sinNombre) : '—'}</td>
      <td class="detalle">${detalle(e)}</td>
    </tr>`
}

function detalle(e) {
  if (e.tipo === 'chat_end' && e.duracion !== null) return `Duración ${duracion(e.duracion)}`
  if (e.tipo === 'duplicate_alert') return 'Dos agentes en el mismo chat'
  if (e.tipo === 'disconnected' && e.motivo) return escapar(MOTIVOS[e.motivo] ?? e.motivo)
  return '—'
}

function contacto(nombre, sinNombre) {
  return escapar(nombre) + (sinNombre ? ' <span class="etiqueta etiqueta-gris">Sin nombre</span>' : '')
}

// ---------- Paginación ----------

// "Mostrando 11–20 de 318" + botones anterior, números y siguiente.
function pintarPaginacion(id, datos, cargar) {
  const caja = document.getElementById(id)
  const paginas = Math.max(1, Math.ceil(datos.total / datos.porPagina))
  const actual = Math.min(datos.pagina, paginas)
  const primero = datos.total === 0 ? 0 : (actual - 1) * datos.porPagina + 1
  const ultimo = Math.min(actual * datos.porPagina, datos.total)

  // Se muestran hasta 5 números alrededor de la página actual.
  const inicio = Math.max(1, Math.min(actual - 2, paginas - 4))
  const fin = Math.min(paginas, inicio + 4)
  let botones = boton(actual - 1, ICONO_ANTERIOR, 'Página anterior', actual === 1)
  for (let n = inicio; n <= fin; n++) {
    botones += `<button class="pagina" type="button" data-pagina="${n}"${n === actual ? ' aria-current="page"' : ''}>${n}</button>`
  }
  botones += boton(actual + 1, ICONO_SIGUIENTE, 'Página siguiente', actual === paginas)

  caja.innerHTML = `
    <span class="nota">Mostrando ${primero}–${ultimo} de ${datos.total}</span>
    <div class="paginas">${botones}</div>`

  caja.querySelectorAll('[data-pagina]').forEach((b) => {
    b.addEventListener('click', () => cargar(Number(b.dataset.pagina)))
  })
}

function boton(pagina, icono, texto, desactivado) {
  return `<button class="pagina" type="button" data-pagina="${pagina}" aria-label="${texto}"${desactivado ? ' disabled' : ''}>${icono}</button>`
}

// ---------- Ayudantes ----------

// ["Ana", "Luis"] -> "Ana y Luis"
function unirNombres(nombres) {
  if (nombres.length <= 1) return nombres[0] ?? '—'
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

// Segundos Unix -> "19/11 10:04" (hora local)
function fechaHora(segundos) {
  const fecha = new Date(segundos * 1000)
  const dia = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })
  return `${dia} ${hora(segundos)}`
}

function hora(segundos) {
  return new Date(segundos * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Segundos -> "00:12:48"
function duracion(segundos) {
  const s = Math.max(0, Math.floor(segundos))
  const dos = (n) => String(n).padStart(2, '0')
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`
}

function filaVacia(columnas, texto) {
  return `<tr><td colspan="${columnas}" class="nota">${texto}</td></tr>`
}

// Evita que un nombre con "<" o "&" rompa la tabla.
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// ---------- Eventos de la pantalla ----------

// Agente y fechas: recargar al cambiar.
formulario.addEventListener('change', (e) => {
  if (e.target.name !== 'contacto') cargarTodo()
})

// Contacto: esperar 400 ms después de la última tecla.
let espera = null
document.getElementById('filtro-contacto').addEventListener('input', () => {
  clearTimeout(espera)
  espera = setTimeout(cargarTodo, 400)
})

// "Limpiar filtros": el navegador vacía el formulario después de este evento.
formulario.addEventListener('reset', () => setTimeout(cargarTodo))

// El formulario no se envía (Enter en "Contacto" no recarga la página).
formulario.addEventListener('submit', (e) => e.preventDefault())

llenarAgentes()
cargarTodo()
