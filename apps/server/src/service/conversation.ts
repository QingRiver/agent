import type { GraphsName } from '@agent/graph'
import type { ConversationThread } from '../../shared/conversation'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  ConversationThreadSchema,
  GraphsNameSchema,
} from '../../shared/conversation'
import { db } from '../db/drizzle'
import { conversationThreads } from '../db/schema'

function formatTitle(seq: number, createdAt: number): string {
  const d = new Date(createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `对话 #${seq} · ${date}`
}

function rowToThread(row: typeof conversationThreads.$inferSelect): ConversationThread {
  return ConversationThreadSchema.parse({
    id: row.id,
    agentId: GraphsNameSchema.parse(row.agentId),
    title: row.title,
    pinned: row.pinned === 1,
    seq: row.seq,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export class ConversationService {
  static list(userId: string): ConversationThread[] {
    const rows = db
      .select()
      .from(conversationThreads)
      .where(eq(conversationThreads.userId, userId))
      .orderBy(desc(conversationThreads.pinned), desc(conversationThreads.updatedAt))
      .all()
    return rows.map(rowToThread)
  }

  static get(userId: string, id: string): ConversationThread | null {
    const row = db
      .select()
      .from(conversationThreads)
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
      .get()
    return row ? rowToThread(row) : null
  }

  static create(userId: string, agentId: GraphsName): ConversationThread {
    const now = Date.now()
    const seqRow = db
      .select({
        nextSeq: sql<number>`COALESCE(MAX(${conversationThreads.seq}), 0) + 1`.as('next_seq'),
      })
      .from(conversationThreads)
      .where(eq(conversationThreads.userId, userId))
      .get()
    const seq = seqRow?.nextSeq ?? 1
    const id = randomUUID()
    const title = formatTitle(seq, now)

    db.insert(conversationThreads).values({
      id,
      userId,
      agentId,
      title,
      pinned: 0,
      seq,
      createdAt: now,
      updatedAt: now,
    }).run()

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

  static setPinned(userId: string, id: string, pinned: boolean): boolean {
    const result = db
      .update(conversationThreads)
      .set({ pinned: pinned ? 1 : 0, updatedAt: Date.now() })
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
      .run()
    return result.changes > 0
  }

  static delete(userId: string, id: string): boolean {
    const result = db
      .delete(conversationThreads)
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
      .run()
    return result.changes > 0
  }

  static touch(userId: string, id: string): void {
    db
      .update(conversationThreads)
      .set({ updatedAt: Date.now() })
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
      .run()
  }

  static ownedByUser(userId: string, id: string): boolean {
    return ConversationService.get(userId, id) != null
  }
}
