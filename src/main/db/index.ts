import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { initializeDatabase } from './schema'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'lession.db')
    db = new Database(dbPath)
    initializeDatabase(db)
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
