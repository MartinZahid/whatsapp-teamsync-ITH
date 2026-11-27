// Comportamiento de la página Reportes.
//
// GUÍA DE LECTURA:
//   Este archivo solo maneja la pantalla. Lo que habla con el servidor está en
//   js/consumo/ (reportes.js y agentes.js). Las gráficas las dibuja Chart.js
//   (js/lib/), que se carga antes en el HTML como la variable global `Chart`.
//   1. Al abrir: periodo = últimos 7 días, agente = Todos.
//   2. Pide los datos y llena tarjetas, gráficas y tablas. Al cambiar un
//      filtro, vuelve a pedirlos.
//   3. Cada agente tiene SIEMPRE el mismo color: sale de su nombre
//      (colorDeAgente), así no cambia aunque cambie el filtro.

import { listarAgentes } from './consumo/agentes.js'
import { obtenerReportes } from './consumo/reportes.js'

const NARANJA = '#EA4E2F'
const TEXTO_SUAVE = '#5B6270'
const LINEA_GUIA = '#EAECF0'
const ESTADOS = [
  { campo: 'atendiendo', texto: 'Atendiendo', color: '#B42318' },
  { campo: 'disponible', texto: 'Disponible', color: '#12B76A' },
  { campo: 'pausado', texto: 'Pausado', color: '#F79009' }
]
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const formulario = document.getElementById('periodo')
const campoDesde = document.getElementById('periodo-desde')
const campoHasta = document.getElementById('periodo-hasta')
const campoAgente = document.getElementById('periodo-agente')

const graficas = {}   // gráficas dibujadas: se borran antes de redibujar

// ---------- Cargar del servidor ----------

async function cargar() {
  try {
    const r = await obtenerReportes({
      desde: segundosDelDia(campoDesde.value, 0, 0, 0),
      hasta: segundosDelDia(campoHasta.value, 23, 59, 59),
      agente: campoAgente.value
    })
    pintarResumen(r.resumen)
    pintarHoras(r.porHora)
    pintarDias(r.porDia)
    pintarAgentes(r.porAgente)
    pintarEstados(r.porEstado)
    pintarContactos(r.topContactos)
    pintarTablaAgentes(r.porAgente)
  } catch {
    document.getElementById('filas-contactos').innerHTML = filaVacia(3, 'Sin conexión con el servidor.')
    document.getElementById('filas-agentes').innerHTML = filaVacia(6, 'Sin conexión con el servidor.')
  }
}

// Lista de agentes del filtro (activos e inactivos: el reporte incluye a todos).
async function llenarAgentes() {
  try {
    const agentes = await listarAgentes()
    campoAgente.innerHTML = '<option value="">Todos</option>' + agentes
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((a) => `<option value="${a.id}">${escapar(a.nombre)}${a.activo ? '' : ' (inactivo)'}</option>`)
      .join('')
  } catch {
    // Sin servidor: se queda solo "Todos".
  }
}

// ---------- Tarjetas ----------

function pintarResumen(r) {
  escribir('total-tiempo', `${horas(r.segundos)} h`)
  escribir('total-sesiones', r.sesiones)
  escribir('total-promedio', duracion(r.promedio))
  escribir('total-contactos', r.contactos)
  escribir('total-duplicidades', r.duplicidades)
}

// ---------- Gráficas ----------

// 24 horas: una línea por agente con su color.
function pintarHoras(porHora) {
  const etiquetas = Array.from({ length: 24 }, (_, h) => `${dos(h)}h`)
  const series = porHora.map((a) => ({
    label: a.agente,
    data: a.minutos,
    borderColor: colorDeAgente(a.agente),
    backgroundColor: colorDeAgente(a.agente),
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 6,
    tension: 0.3,
    cubicInterpolationMode: 'monotone'   // la curva no baja de 0 ni pasa del valor real
  }))
  dibujar('grafica-horas', 'line', etiquetas, series, { unidad: ' min', leyenda: true })
}

// Una barra por cada día del periodo, aunque ese día no haya atenciones (0 h).
function pintarDias(porDia) {
  const segundosDe = Object.fromEntries(porDia.map((d) => [d.dia, d.segundos]))
  const dias = diasDelPeriodo(porDia)
  const etiquetas = dias.map((d) => {
    const fecha = new Date(`${d}T00:00`)
    return `${DIAS[fecha.getDay()]} ${fecha.getDate()}/${fecha.getMonth() + 1}`
  })
  dibujar('grafica-dias', 'bar', etiquetas, [barras('Horas', dias.map((d) => horas(segundosDe[d] ?? 0)), NARANJA)], { unidad: ' h' })
}

// Una barra por agente, cada una con el color del agente.
function pintarAgentes(porAgente) {
  const conTiempo = porAgente.filter((a) => a.segundos > 0)
  dibujar(
    'grafica-agentes',
    'bar',
    conTiempo.map((a) => a.agente),
    [barras('Horas', conTiempo.map((a) => horas(a.segundos)), conTiempo.map((a) => colorDeAgente(a.agente)))],
    { unidad: ' h' }
  )
}

// Barra horizontal apilada por agente: atendiendo, disponible y pausado.
function pintarEstados(porEstado) {
  const series = ESTADOS.map((e) => ({
    label: e.texto,
    data: porEstado.map((a) => horas(a[e.campo])),
    backgroundColor: e.color,
    borderColor: '#FFFFFF',
    borderWidth: { right: 2 },
    barThickness: 22
  }))
  dibujar('grafica-estados', 'bar', porEstado.map((a) => a.agente), series, { unidad: ' h', leyenda: true, horizontal: true })
}

function barras(nombre, valores, color) {
  return { label: nombre, data: valores, backgroundColor: color, borderRadius: 4, maxBarThickness: 36 }
}

// Dibuja (o vuelve a dibujar) una gráfica.
// opciones: unidad (texto tras el valor al pasar el mouse), leyenda, horizontal (barras apiladas acostadas).
function dibujar(id, tipo, etiquetas, series, { unidad = '', leyenda = false, horizontal = false } = {}) {
  const sinDatos = etiquetas.length === 0 || series.every((s) => s.data.every((v) => !v))
  const ejeValores = { beginAtZero: true, stacked: horizontal, grid: { color: LINEA_GUIA }, ticks: { color: TEXTO_SUAVE, precision: 0 } }
  const ejeNombres = { stacked: horizontal, grid: { display: false }, ticks: { color: horizontal ? '#1F2329' : TEXTO_SUAVE } }

  graficas[id]?.destroy()
  graficas[id] = new Chart(document.getElementById(id), {
    type: tipo,
    data: { labels: etiquetas, datasets: series },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: leyenda, position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 8, color: TEXTO_SUAVE } },
        title: { display: sinDatos, text: 'Sin datos en este periodo', color: TEXTO_SUAVE },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue}${unidad}` } }
      },
      scales: horizontal ? { x: ejeValores, y: ejeNombres } : { x: ejeNombres, y: ejeValores }
    }
  })
}

// ---------- Tablas ----------

function pintarContactos(lista) {
  document.getElementById('filas-contactos').innerHTML = lista.map((c) => `
    <tr>
      <td>${escapar(c.contacto)}${c.sinNombre ? ' <span class="etiqueta etiqueta-gris">Sin nombre</span>' : ''}</td>
      <td class="hora">${c.sesiones}</td>
      <td class="tiempo">${duracion(c.segundos)}</td>
    </tr>`).join('') || filaVacia(3, 'Sin atenciones en este periodo.')
}

function pintarTablaAgentes(lista) {
  document.getElementById('filas-agentes').innerHTML = lista.map((a) => `
    <tr>
      <td class="nombre"><span class="punto-agente" style="background:${colorDeAgente(a.agente)}"></span>${escapar(a.agente)}</td>
      <td class="tiempo">${horas(a.segundos)} h</td>
      <td class="hora">${a.sesiones}</td>
      <td class="tiempo">${duracion(a.promedio)}</td>
      <td class="hora">${a.ayudas}</td>
      <td class="hora">${a.duplicidades}</td>
    </tr>`).join('') || filaVacia(6, 'Sin actividad en este periodo.')
}

// ---------- Color de cada agente ----------

// Las 5 primeras letras del nombre se convierten en un número (hash) y de ese
// número salen el rojo, el verde y el azul. Si el color queda muy claro (no se
// vería sobre el fondo blanco) se oscurece poco a poco hasta que se ve bien.
// Mismo nombre = mismo color, siempre.
function colorDeAgente(nombre) {
  const clave = nombre.trim().toLowerCase().slice(0, 5)
  let hash = 0
  for (const letra of clave) hash = (Math.imul(hash, 31) + letra.codePointAt(0)) >>> 0
  // Mezcla los bits para que nombres parecidos ("Ana T", "Ana R") den colores distintos.
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0
  hash = (hash ^ (hash >>> 16)) >>> 0

  let rojo = hash & 255
  let verde = (hash >>> 8) & 255
  let azul = (hash >>> 16) & 255
  while (contrasteConBlanco(rojo, verde, azul) < 3) {   // 3:1 = mínimo para que una línea se vea
    rojo = Math.floor(rojo * 0.9)
    verde = Math.floor(verde * 0.9)
    azul = Math.floor(azul * 0.9)
  }
  return `rgb(${rojo}, ${verde}, ${azul})`
}

// Contraste de un color contra el blanco (1 = igual de claro, 21 = negro).
function contrasteConBlanco(r, g, b) {
  const canal = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luz = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  return 1.05 / (luz + 0.05)
}

// ---------- Periodo ----------

// Pone "Desde" = hace 6 días y "Hasta" = hoy.
function ultimos7Dias() {
  const hoy = new Date()
  const inicio = new Date()
  inicio.setDate(hoy.getDate() - 6)
  campoDesde.value = textoDeFecha(inicio)
  campoHasta.value = textoDeFecha(hoy)
}

// Los días del periodo como "2026-11-26". Sin fechas, los días que traen datos.
function diasDelPeriodo(porDia) {
  const desde = campoDesde.value || porDia[0]?.dia
  const hasta = campoHasta.value || porDia[porDia.length - 1]?.dia
  const dias = []
  if (!desde || !hasta) return dias
  for (let d = new Date(`${desde}T00:00`); textoDeFecha(d) <= hasta && dias.length < 366; d.setDate(d.getDate() + 1)) {
    dias.push(textoDeFecha(d))
  }
  return dias
}

// Date -> "2026-11-26" (hora local)
function textoDeFecha(fecha) {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

// "2026-11-19" -> segundos Unix de ese día a la hora indicada. Vacío -> ''.
function segundosDelDia(texto, h, m, s) {
  if (!texto) return ''
  const [anio, mes, dia] = texto.split('-').map(Number)
  return Math.floor(new Date(anio, mes - 1, dia, h, m, s).getTime() / 1000)
}

// ---------- Ayudantes ----------

// Segundos -> horas con un decimal: 5400 -> 1.5
function horas(segundos) {
  return Math.round(segundos / 360) / 10
}

// Segundos -> "00:12:48"
function duracion(segundos) {
  const s = Math.max(0, Math.floor(segundos))
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`
}

function dos(n) {
  return String(n).padStart(2, '0')
}

function escribir(id, valor) {
  document.getElementById(id).textContent = valor
}

function filaVacia(columnas, texto) {
  return `<tr><td colspan="${columnas}" class="nota">${texto}</td></tr>`
}

// Evita que un nombre con "<" o "&" rompa la tabla.
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// ---------- Eventos de la pantalla ----------

formulario.addEventListener('change', cargar)
document.getElementById('ultimos-7').addEventListener('click', () => {
  ultimos7Dias()
  cargar()
})

// ---------- Arranque ----------
ultimos7Dias()
llenarAgentes()
cargar()
