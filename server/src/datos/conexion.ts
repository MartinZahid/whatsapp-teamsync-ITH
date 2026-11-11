// CAPA 3 · DATOS — conexión con SQLite (sql.js).
//
// GUÍA DE LECTURA — qué hace este archivo:
//   sql.js es SQLite compilado a WebAssembly: la base vive EN MEMORIA.
//   Por eso este archivo se encarga de:
//     1. Cargar el archivo .db al arrancar (o crearlo con esquema.ts).
//     2. Guardar la memoria al disco cada pocos segundos si hubo cambios.
//     3. Guardar una última vez al cerrar el servidor.
//   El guardado es ATÓMICO: se escribe un archivo temporal y luego se
//   renombra, para que un corte a la mitad no deje el .db dañado.
//
//   Los repos (agentes.ts, contactos.ts, ...) NO usan sql.js directamente:
//   usan los tres métodos de abajo, y así ninguno olvida avisar del cambio.
//     · ejecutar(sql, params) -> escribe (INSERT / UPDATE) y devuelve el id nuevo
//     · una(sql, params)      -> lee UNA fila (o null si no hay)
//     · todas(sql, params)    -> lee TODAS las filas
//   `?` en el SQL = parámetro: sql.js lo rellena con el valor del arreglo, así
//   el texto del usuario nunca se mezcla con el SQL (evita inyección SQL).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { ESQUEMA } from './esquema.js'

// Una fila leída de la base: { nombre_de_columna: valor }.
export type Fila = Record<string, SqlValue>

// Versión del esquema guardada en PRAGMA user_version (1 = las 8 tablas).
// Si el esquema cambia, se sube este número y se agrega una migración.
const VERSION_ESQUEMA = 1
const INTERVALO_GUARDADO_MS = 2000

export class BaseDeDatos {
  private sucia = false
  private temporizador: NodeJS.Timeout | null = null

  private constructor(
    private readonly db: Database,
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
    const version = this.una('PRAGMA user_version')!.user_version as number
    if (version === 0) {
      this.db.exec(ESQUEMA)
      this.db.exec(`PRAGMA user_version = ${VERSION_ESQUEMA};`)
      this.sucia = true
    } else if (version > VERSION_ESQUEMA) {
      throw new Error(`La base tiene la versión ${version}; este servidor solo conoce hasta la ${VERSION_ESQUEMA}`)
    }
  }

  // Escribe en la base (INSERT, UPDATE) y devuelve el id que SQLite asignó
  // a la fila nueva. Anota que hay cambios pendientes de guardar en disco.
  ejecutar(sql: string, params: SqlValue[] = []): number {
    this.db.run(sql, params)
    this.sucia = true
    return this.una('SELECT last_insert_rowid() AS id')!.id as number
  }

  // Lee todas las filas de una consulta.
  todas(sql: string, params: SqlValue[] = []): Fila[] {
    const consulta = this.db.prepare(sql, params)
    const filas: Fila[] = []
    try {
      while (consulta.step()) filas.push(consulta.getAsObject())
    } finally {
      consulta.free() // libera la memoria de la consulta aunque haya fallado
    }
    return filas
  }

  // Lee solo la primera fila; null si la consulta no devolvió nada.
  una(sql: string, params: SqlValue[] = []): Fila | null {
    return this.todas(sql, params)[0] ?? null
  }

  // Ejecuta varias escrituras como una sola unidad: o se guardan todas o ninguna.
  transaccion<T>(trabajo: () => T): T {
    this.db.exec('BEGIN;')
    try {
      const resultado = trabajo()
      this.db.exec('COMMIT;')
      return resultado
    } catch (err) {
      this.db.exec('ROLLBACK;')
      throw err
    }
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