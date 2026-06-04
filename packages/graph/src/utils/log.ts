import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const graphDebugDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../debug',
)

function serializeForFileLog(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  }
  catch {
    return String(value)
  }
}

function pickFileLogEntry(args: unknown[]): unknown {
  const target = args.length === 1 ? args[0] : args.at(-1)
  return serializeForFileLog(target)
}

function appendJsonDebugLog(filePath: string, entry: unknown) {
  mkdirSync(dirname(filePath), { recursive: true })
  const entries: unknown[] = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, 'utf8')) as unknown[]
    : []
  entries.push(entry)
  writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`)
}

/**
 * 等同 console.log；并把你关心的对象追加进 debug JSON 数组（无 at/args 包装）
 * 多个参数时写入最后一个；首个参数若以 `.json` 结尾则为日志文件名
 */
export function fileLog(...args: unknown[]) {
  let filePath = join(graphDebugDir, 'fileLog.json')
  let payload = args

  if (
    typeof args[0] === 'string'
    && (args[0].endsWith('.json') || args[0].includes('/'))
  ) {
    const target = args[0]
    filePath = target.includes('/')
      ? target
      : join(graphDebugDir, target)
    payload = args.slice(1)
  }

  console.log(...payload)
  appendJsonDebugLog(filePath, pickFileLogEntry(payload))
}

/** 清空指定 debug JSON 日志（下次 fileLog 从空数组重新追加） */
export function resetFileLog(target: string) {
  const filePath = target.includes('/')
    ? target
    : join(graphDebugDir, target)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, '[]\n')
}
