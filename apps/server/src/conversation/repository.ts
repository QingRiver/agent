import type {
  AgentId,
  AgUiMessage,
  ConversationThread,
} from '../../shared/conversation'
import { randomUUID } from 'node:crypto'
import {
  AgentIdSchema,
  ConversationThreadSchema,
} from '../../shared/conversation'
import { appDb } from '../db/sqlite'

interface ThreadRow {
  id: string
  user_id: string
  agent_id: string
  title: string
  pinned: number
  seq: number
  created_at: number
  updated_at: number
}

function formatTitle(seq: number, createdAt: number): string {
  const d = new Date(createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `对话 #${seq} · ${date}`
}

function rowToThread(row: ThreadRow): ConversationThread {
  return ConversationThreadSchema.parse({
    id: row.id,
    agentId: AgentIdSchema.parse(row.agent_id),
    title: row.title,
    pinned: row.pinned === 1,
    seq: row.seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function listConversations(userId: string): ConversationThread[] {
  const rows = appDb().prepare(`
    SELECT id, user_id, agent_id, title, pinned, seq, created_at, updated_at
    FROM conversation_threads
    WHERE user_id = ?
    ORDER BY pinned DESC, updated_at DESC
  `).all(userId) as ThreadRow[]
  return rows.map(rowToThread)
}

export function getConversation(userId: string, id: string): ConversationThread | null {
  const row = appDb().prepare(`
    SELECT id, user_id, agent_id, title, pinned, seq, created_at, updated_at
    FROM conversation_threads
    WHERE id = ? AND user_id = ?
  `).get(id, userId) as ThreadRow | undefined
  return row ? rowToThread(row) : null
}

export function createConversation(userId: string, agentId: AgentId): ConversationThread {
  const db = appDb()
  const now = Date.now()
  const seqRow = db.prepare(`
    SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
    FROM conversation_threads WHERE user_id = ?
  `).get(userId) as { next_seq: number }
  const seq = seqRow.next_seq
  const id = randomUUID()
  const title = formatTitle(seq, now)

  db.prepare(`
    INSERT INTO conversation_threads (id, user_id, agent_id, title, pinned, seq, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, userId, agentId, title, seq, now, now)

  db.prepare(`
    INSERT INTO conversation_messages (thread_id, messages, updated_at)
    VALUES (?, '[]', ?)
  `).run(id, now)

  return ConversationThreadSchema.parse({
    id,
    agentId,
    title,
    pinned: false,
    seq,
    createdAt: now,
    updatedAt: now,
  })
}

export function setConversationPinned(userId: string, id: string, pinned: boolean): boolean {
  const now = Date.now()
  const result = appDb().prepare(`
    UPDATE conversation_threads SET pinned = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(pinned ? 1 : 0, now, id, userId)
  return result.changes > 0
}

export function deleteConversation(userId: string, id: string): boolean {
  const db = appDb()
  const owned = getConversation(userId, id)
  if (!owned)
    return false

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM conversation_messages WHERE thread_id = ?').run(id)
    db.prepare('DELETE FROM conversation_threads WHERE id = ? AND user_id = ?').run(id, userId)
  })
  tx()
  return true
}

export function touchConversation(userId: string, id: string): void {
  appDb().prepare(`
    UPDATE conversation_threads SET updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(Date.now(), id, userId)
}

export function getConversationMessages(userId: string, id: string): AgUiMessage[] {
  const owned = getConversation(userId, id)
  if (!owned)
    return []

  const row = appDb().prepare(`
    SELECT messages FROM conversation_messages WHERE thread_id = ?
  `).get(id) as { messages: string } | undefined

  if (!row)
    return []

  try {
    const parsed = JSON.parse(row.messages) as unknown
    return Array.isArray(parsed) ? parsed as AgUiMessage[] : []
  }
  catch {
    return []
  }
}

export function saveConversationMessages(
  userId: string,
  id: string,
  messages: AgUiMessage[],
): void {
  const owned = getConversation(userId, id)
  if (!owned)
    return

  const now = Date.now()
  const db = appDb()
  db.prepare(`
    INSERT INTO conversation_messages (thread_id, messages, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
  `).run(id, JSON.stringify(messages), now)

  db.prepare(`
    UPDATE conversation_threads SET updated_at = ? WHERE id = ? AND user_id = ?
  `).run(now, id, userId)
}

export function conversationOwnedByUser(userId: string, id: string): boolean {
  return getConversation(userId, id) != null
}
