import fs from 'node:fs'
import path from 'node:path'
import { dataDirPath } from '@agent/env'
import Database from 'better-sqlite3'

let dataDir = dataDirPath

export function getDataDir(): string {
  return dataDir
}

export function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true })
}

/** 测试或注入自定义数据目录 */
export function setDataDirForTests(dir: string): void {
  dataDir = dir
}

export function openDatabase(filename: string, options?: Database.Options): Database.Database {
  ensureDataDir()
  return new Database(path.join(dataDir, filename), options)
}

export function authDb(): Database.Database {
  return openDatabase('auth.sqlite')
}

export function appDb(): Database.Database {
  return openDatabase('app.sqlite')
}

export function checkpointDbPath(): string {
  ensureDataDir()
  return path.join(dataDir, 'checkpoints.sqlite')
}
