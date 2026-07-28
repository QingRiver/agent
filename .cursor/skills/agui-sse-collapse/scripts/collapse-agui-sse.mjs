#!/usr/bin/env node
/**
 * Collapse AG-UI / CopilotKit text/event-stream dumps to save tokens.
 *
 * Folds TEXT_MESSAGE_CONTENT and REASONING_MESSAGE_CONTENT deltas into one
 * CONTENT event per messageId (emitted at END, or at EOF if END missing).
 * All other events pass through in original order.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const TEXT_CONTENT = 'TEXT_MESSAGE_CONTENT'
const TEXT_START = 'TEXT_MESSAGE_START'
const TEXT_END = 'TEXT_MESSAGE_END'
const REASON_CONTENT = 'REASONING_MESSAGE_CONTENT'
const REASON_START = 'REASONING_MESSAGE_START'
const REASON_END = 'REASONING_MESSAGE_END'

const FOLD_CONTENT = new Set([TEXT_CONTENT, REASON_CONTENT])
const FOLD_START = new Set([TEXT_START, REASON_START])
const FOLD_END = new Set([TEXT_END, REASON_END])

/**
 * @param {string} raw
 * @returns {Record<string, unknown>[]}
 */
function parseSseLines(raw) {
  /** @type {Record<string, unknown>[]} */
  const events = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed)
      continue
    let payload = trimmed
    if (trimmed.startsWith('data:')) {
      payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]')
        continue
    }
    else if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      continue
    }
    try {
      events.push(JSON.parse(payload))
    }
    catch {
      /* skip bad lines */
    }
  }
  return events
}

/**
 * @param {'text' | 'reasoning'} kind
 */
function contentTypeFor(kind) {
  return kind === 'text' ? TEXT_CONTENT : REASON_CONTENT
}

/**
 * @param {'text' | 'reasoning'} kind
 */
function endTypeFor(kind) {
  return kind === 'text' ? TEXT_END : REASON_END
}

/**
 * @param {string} eventType
 * @returns {'text' | 'reasoning' | null}
 */
function kindForEvent(eventType) {
  if (eventType === TEXT_START || eventType === TEXT_CONTENT || eventType === TEXT_END)
    return 'text'
  if (eventType === REASON_START || eventType === REASON_CONTENT || eventType === REASON_END)
    return 'reasoning'
  return null
}

/**
 * @param {Record<string, unknown>[]} events
 * @returns {Record<string, unknown>[]}
 */
function collapseEvents(events) {
  /** @type {Record<string, unknown>[]} */
  const out = []
  /** @type {Map<string, { kind: 'text' | 'reasoning', messageId: string, role?: string, parts: string[], started: boolean }>} */
  const buffers = new Map()

  /**
   * @param {'text' | 'reasoning'} kind
   * @param {string} messageId
   */
  function ensureBuf(kind, messageId) {
    let buf = buffers.get(messageId)
    if (!buf) {
      buf = { kind, messageId, parts: [], started: false }
      buffers.set(messageId, buf)
    }
    return buf
  }

  /**
   * @param {string} messageId
   * @param {{ emitEnd: boolean }} opts
   */
  function flush(messageId, opts) {
    const buf = buffers.get(messageId)
    if (!buf)
      return
    buffers.delete(messageId)
    out.push({
      type: contentTypeFor(buf.kind),
      messageId: buf.messageId,
      delta: buf.parts.join(''),
    })
    if (opts.emitEnd) {
      out.push({
        type: endTypeFor(buf.kind),
        messageId: buf.messageId,
      })
    }
  }

  for (const event of events) {
    const t = event.type
    if (typeof t !== 'string') {
      out.push(event)
      continue
    }

    const kind = kindForEvent(t)
    if (kind == null) {
      out.push(event)
      continue
    }

    const mid = event.messageId
    if (typeof mid !== 'string' || !mid) {
      out.push(event)
      continue
    }

    if (FOLD_START.has(t)) {
      const buf = ensureBuf(kind, mid)
      buf.started = true
      if (typeof event.role === 'string')
        buf.role = event.role
      /** @type {Record<string, unknown>} */
      const startEvent = { type: t, messageId: mid }
      if (buf.role)
        startEvent.role = buf.role
      out.push(startEvent)
      continue
    }

    if (FOLD_CONTENT.has(t)) {
      const buf = ensureBuf(kind, mid)
      if (typeof event.delta === 'string' && event.delta)
        buf.parts.push(event.delta)
      continue
    }

    if (FOLD_END.has(t)) {
      if (!buffers.has(mid)) {
        out.push(event)
        continue
      }
      flush(mid, { emitEnd: true })
      continue
    }

    out.push(event)
  }

  for (const mid of [...buffers.keys()])
    flush(mid, { emitEnd: false })

  return out
}

/**
 * @param {Record<string, unknown>[]} events
 */
function formatSse(events) {
  return `${events.map(e => `data: ${JSON.stringify(e)}`).join('\n\n')}${events.length ? '\n\n' : ''}`
}

/**
 * @param {Record<string, unknown>[]} events
 */
function formatJsonl(events) {
  return events.map(e => `${JSON.stringify(e)}\n`).join('')
}

/**
 * @param {Record<string, unknown>[]} original
 * @param {Record<string, unknown>[]} collapsed
 */
function formatSummary(original, collapsed) {
  const origContent = original.filter(e => FOLD_CONTENT.has(String(e.type))).length
  const newContent = collapsed.filter(e => FOLD_CONTENT.has(String(e.type))).length
  /** @type {string[]} */
  const lines = [
    '# Collapsed AG-UI event-stream',
    '',
    `- original events: **${original.length}**`,
    `- collapsed events: **${collapsed.length}**`,
    `- CONTENT deltas: **${origContent} → ${newContent}**`,
    '',
  ]

  let idx = 0
  for (const event of collapsed) {
    idx += 1
    const t = String(event.type ?? '?')
    const mid = typeof event.messageId === 'string' ? event.messageId : ''

    if (FOLD_CONTENT.has(t)) {
      const label = t === TEXT_CONTENT ? 'TEXT' : 'REASONING'
      const delta = typeof event.delta === 'string' ? event.delta : ''
      lines.push(`## ${idx}. ${label} (collapsed) \`${mid}\``)
      lines.push('')
      lines.push(`chars: ${delta.length}`)
      lines.push('')
      lines.push('```')
      lines.push(delta)
      lines.push('```')
      lines.push('')
      continue
    }

    /** @type {Record<string, unknown>} */
    let meta = {}
    for (const [k, v] of Object.entries(event)) {
      if (k === 'type' || k === 'input')
        continue
      meta[k] = v
    }

    if (t === 'RUN_STARTED' && event.input && typeof event.input === 'object') {
      const inp = /** @type {Record<string, unknown>} */ (event.input)
      meta = {
        threadId: event.threadId ?? inp.threadId,
        runId: event.runId ?? inp.runId,
        userMessages: inp.messages,
      }
    }

    let metaS = JSON.stringify(meta)
    if (metaS.length > 400)
      metaS = `${metaS.slice(0, 400)}…`
    lines.push(`## ${idx}. \`${t}\` ${metaS}`)
    lines.push('')
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

function readStdin() {
  return readFileSync(0, 'utf8')
}

function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: 'string', short: 'o' },
      format: { type: 'string', short: 'f', default: 'summary' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    process.stdout.write(`Usage: collapse-agui-sse.mjs [input] [-o out] [-f summary|sse|jsonl]

Collapse TEXT_MESSAGE_CONTENT / REASONING_MESSAGE_CONTENT deltas in AG-UI SSE dumps.
`)
    process.exit(0)
  }

  const format = values.format ?? 'summary'
  if (format !== 'summary' && format !== 'sse' && format !== 'jsonl') {
    console.error(`Invalid --format: ${format}`)
    process.exit(1)
  }

  const inputPath = positionals[0]
  const raw = inputPath ? readFileSync(inputPath, 'utf8') : readStdin()
  const original = parseSseLines(raw)
  if (!original.length) {
    console.error('No AG-UI events parsed from input.')
    process.exit(1)
  }

  const collapsed = collapseEvents(original)
  let text
  if (format === 'summary')
    text = formatSummary(original, collapsed)
  else if (format === 'sse')
    text = formatSse(collapsed)
  else
    text = formatJsonl(collapsed)

  if (values.output)
    writeFileSync(values.output, text, 'utf8')
  else
    process.stdout.write(text)

  const oc = original.filter(e => FOLD_CONTENT.has(String(e.type))).length
  const nc = collapsed.filter(e => FOLD_CONTENT.has(String(e.type))).length
  console.error(`[collapse] ${original.length} → ${collapsed.length} events (CONTENT ${oc} → ${nc})`)
}

main()
