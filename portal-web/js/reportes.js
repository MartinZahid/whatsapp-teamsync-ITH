// Comportamiento de la página Reportes.
//
// GUÍA DE LECTURA:
//   Este archivo solo maneja la pantalla. Lo que habla con el servidor está en
//   js/consumo/reportes.js. Las gráficas las dibuja Chart.js (js/lib/), que
//   se carga antes en el HTML y deja disponible la variable global `Chart`.
//   1. Al abrir, el periodo son los últimos 7 días.
//   2. Pide los datos del periodo y llena las tarjetas, las 3 gráficas y la
//      tabla de contactos. Al cambiar una fecha, vuelve a pedirlos.

import { obtenerReportes } from './consumo/reportes.js'

const NARANJA = '#EA4E2F'
const TEXTO_SUAVE = '#5B6270'
const LINEA_GUIA = '#EAECF0'
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const formulario = document.getElementById('periodo')
const campoDesde = document.getElementById('periodo-desde')
const campoHasta = document.getElementById('periodo-hasta')

const graficas = {}   // las 3 gráficas dibujadas: se borran antes de redibujar

// ---------- Cargar del servidor ----------

async function cargar() {
  try {
    const r = await obtenerReportes(segundosDelDia(campoDesde.value, 0, 0, 0), segundosDelDia(campoHasta.value, 23, 59, 59))
    pintarResumen(r.resumen)
    pintarDias(r.porDia)
    dibujar('grafica-agentes', 'bar', r.porAgente.map((a) => a.agente), r.porAgente.map((a) => horas(a.segundos)), 'h')
    pintarHoras(r.porHora)
    pintarContactos(r.topContactos)
  } catch {
    document.getElementById('filas-contactos').innerHTML = filaVacia('Sin conexión con el servidor.')
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

// Una barra por cada día del periodo, aunque ese día no haya atenciones (0 h).
function pintarDias(porDia) {
  const segundosDe = Object.fromEntries(porDia.map((d) => [d.dia, d.segundos]))
  const dias = diasDelPeriodo(porDia)
  const etiquetas = dias.map((d) => {
    const fecha = new Date(`${d}T00:00`)
    return `${DIAS[fecha.getDay()]} ${fecha.getDate()}/${fecha.getMonth() + 1}`
  })
  dibujar('grafica-dias', 'bar', etiquetas, dias.map((d) => horas(segundosDe[d] ?? 0)), 'h')
}

// Una marca por hora, de la primera a la última hora con atenciones.
function pintarHoras(porHora) {
  const sesionesDe = Object.fromEntries(porHora.map((h) => [h.hora, h.sesiones]))
  const horasDelDia = []
  if (porHora.length) {
    for (let h = porHora[0].hora; h <= porHora[porHora.length - 1].hora; h++) horasDelDia.push(h)
  }
  dibujar('grafica-horas', 'line', horasDelDia.map((h) => `${dos(h)}h`), horasDelDia.map((h) => sesionesDe[h] ?? 0), ' sesiones')
}

// Dibuja (o vuelve a dibujar) una gráfica de una sola serie.
// `unidad` se agrega al valor del recuadro que sale al pasar el mouse.
function dibujar(id, tipo, etiquetas, valores, unidad) {
  graficas[id]?.destroy()
  graficas[id] = new Chart(document.getElementById(id), {
    type: tipo,
    data: {
      labels: etiquetas,
      datasets: [{
        data: valores,
        backgroundColor: NARANJA,
        borderColor: NARANJA,
        borderWidth: tipo === 'line' ? 2 : 0,
        borderRadius: 4,            // barras con la punta redondeada
        maxBarThickness: 36,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        cubicInterpolationMode: 'monotone' // la curva no baja de 0 ni pasa del valor real
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },  // una sola serie: el título de la tarjeta la nombra
        title: { display: valores.length === 0, text: 'Sin datos en este periodo', color: TEXTO_SUAVE },
        tooltip: { callbacks: { label: (c) => `${c.formattedValue}${unidad}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: TEXTO_SUAVE } },
        y: { beginAtZero: true, grid: { color: LINEA_GUIA }, ticks: { color: TEXTO_SUAVE, precision: 0 } }
      }
    }
  })
}

// ---------- Contactos más atendidos ----------

function pintarContactos(lista) {
  document.getElementById('filas-contactos').innerHTML = lista.map((c) => `
    <tr>
      <td>${escapar(c.contacto)}${c.sinNombre ? ' <span class="etiqueta etiqueta-gris">Sin nombre</span>' : ''}</td>
      <td class="hora">${c.sesiones}</td>
      <td class="tiempo">${duracion(c.segundos)}</td>
    </tr>`).join('') || filaVacia('Sin atenciones en este periodo.')
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

function filaVacia(texto) {
  return `<tr><td colspan="3" class="nota">${texto}</td></tr>`
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
cargar()
