// CAPA 3 · DATOS — conexión con SQLite (sql.js).
//
// GUÍA DE LECTURA — qué hace este archivo:
//   sql.js es SQLite compilado a WebAssembly: la base vive EN MEMORIA.
//   Por eso este archivo se encarga de:
//     1. Cargar el archivo .db al arrancar (o crearlo con esquema.sql).
//     2. Guardar la memoria al disco cada pocos segundos si hubo cambios.
//     3. Guardar una última vez al cerrar el servidor.
//   El guardado es ATÓMICO: se escribe un archivo temporal y luego se
//   renombra, para que un corte a la mitad no deje el .db dañado.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database } from 'sql.js'

// Versión del esquema guardada en PRAGMA user_version (1 = las 8 tablas).
// Si el esquema cambia, se sube este número y se agrega una migración.
const VERSION_ESQUEMA = 1
const INTERVALO_GUARDADO_MS = 2000

// esquema.sql se copia junto a este archivo al compilar (ver build:server).
const RUTA_ESQUEMA = join(dirname(fileURLToPath(import.meta.url)), 'esquema.sql')

export class BaseDeDatos {
  private sucia = false
  private temporizador: NodeJS.Timeout | null = null

  private constructor(
    readonly db: Database,
    private readonly ruta: string | null
  ) {}

  // Abre (o crea) la base. Con ruta = null trabaja solo en memoria (pruebas).
  static async abrir(ruta: string | null): Promise<BaseDeDatos> {
    const SQL = await initSqlJs()
    const existe = ruta !== null && existsSync(ruta)
    const db = existe ? new SQL.Database(readFileSync(ruta)) : new SQL.Database()
    db.exec('PRAGMA foreign_keys = ON;')

    const base = new BaseDeDatos(db, ruta)
    base.prepararEsquema()
    if (ruta) {
      console.log(`[Datos] Base ${existe ? 'cargada' : 'creada'}: ${ruta}`)
      base.temporizador = setInterval(() => base.guardar(), INTERVALO_GUARDADO_MS)
    }
    return base
  }

  // Crea las tablas si la base es nueva; si ya tiene versión, la respeta.
  private prepararEsquema(): void {
    const version = this.db.exec('PRAGMA user_version;')[0].values[0][0] as number
    if (version === 0) {
      this.db.exec(readFileSync(RUTA_ESQUEMA, 'utf8'))
      this.db.exec(`PRAGMA user_version = ${VERSION_ESQUEMA};`)
      this.marcarCambio()
    } else if (version > VERSION_ESQUEMA) {
      throw new Error(`La base tiene la versión ${version}; este servidor solo conoce hasta la ${VERSION_ESQUEMA}`)
    }
  }

  // Ejecuta varias escrituras como una sola unidad: o se guardan todas o ninguna.
  transaccion<T>(trabajo: () => T): T {
    this.db.exec('BEGIN;')
    try {
      const resultado = trabajo()
      this.db.exec('COMMIT;')
      this.marcarCambio()
      return resultado
    } catch (err) {
      this.db.exec('ROLLBACK;')
      throw err
    }
  }

  marcarCambio(): void {
    this.sucia = true
  }

  // Escribe la base al disco solo si hubo cambios desde el último guardado.
  guardar(): void {
    if (!this.ruta || !this.sucia) return
    mkdirSync(dirname(this.ruta), { recursive: true })
    const temporal = `${this.ruta}.tmp`
    writeFileSync(temporal, this.db.export())
    // export() reabre la base internamente y se pierden los PRAGMA de sesión.
    this.db.exec('PRAGMA foreign_keys = ON;')
    renameSync(temporal, this.ruta)
    this.sucia = false
  }

  cerrar(): void {
    if (this.temporizador) clearInterval(this.temporizador)
    this.guardar()
    this.db.close()
  }
}