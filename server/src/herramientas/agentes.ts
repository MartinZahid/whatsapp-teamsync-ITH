// HERRAMIENTA de consola para dar de alta y de baja agentes mientras no exista
// el dashboard (ADR-001). Usa la misma capa de datos que el servidor.
//
//   npm run agentes -- lista
//   npm run agentes -- alta "Ana Torres" "Luis Pérez"
//   npm run agentes -- baja "Luis Pérez"
//
// IMPORTANTE: detén el servidor antes de usarla. sql.js tiene la base EN
// MEMORIA y la guarda cada 2 s, así que si el servidor está corriendo
// sobrescribiría estos cambios.

import { BaseDeDatos } from '../datos/conexion.js'
import { buscarAgentePorNombre, buscarOCrearAgente, darDeBajaAgente, listarAgentesActivos } from '../datos/agentes.js'

const DB_PATH = process.env.DB_PATH || 'data/whatsapp_team_sync.db'
const [accion, ...nombres] = process.argv.slice(2)

const base = await BaseDeDatos.abrir(DB_PATH)

switch (accion) {
  case 'alta':
    for (const nombre of nombres.map((n) => n.trim()).filter(Boolean)) {
      const agente = buscarOCrearAgente(base, nombre)
      console.log(`Alta: ${agente.name} (id ${agente.id})`)
    }
    break
  case 'baja':
    for (const nombre of nombres) {
      const agente = buscarAgentePorNombre(base, nombre.trim())
      if (!agente) {
        console.log(`No existe un agente activo llamado "${nombre}"`)
        continue
      }
      darDeBajaAgente(base, agente.id)
      console.log(`Baja: ${agente.name}`)
    }
    break
  case 'lista':
  case undefined:
    break
  default:
    console.log('Uso: npm run agentes -- [lista | alta "Nombre" ... | baja "Nombre" ...]')
}

console.log('\nAgentes activos:')
for (const agente of listarAgentesActivos(base)) console.log(`  ${agente.id}. ${agente.name}`)

base.cerrar()
