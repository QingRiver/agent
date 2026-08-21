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
    pinned: row.pinned,
    seq: row.seq,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export class ConversationService {
  static async list(userId: string): Promise<ConversationThread[]> {
    const rows = await db
      .select()
      .from(conversationThreads)
      .where(eq(conversationThreads.userId, userId))
      .orderBy(desc(conversationThreads.pinned), desc(conversationThreads.updatedAt))
    return rows.map(rowToThread)
  }

  static async get(userId: string, id: string): Promise<ConversationThread | null> {
    const rows = await db
      .select()
      .from(conversationThreads)
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
    const row = rows[0]
    return row ? rowToThread(row) : null
  }

  static async create(userId: string, agentId: GraphsName): Promise<ConversationThread> {
    const now = Date.now()
    const seqRows = await db
      .select({
        nextSeq: sql<number>`COALESCE(MAX(${conversationThreads.seq}), 0) + 1`.as('next_seq'),
      })
      .from(conversationThreads)
      .where(eq(conversationThreads.userId, userId))
    const seq = seqRows[0]?.nextSeq ?? 1
    const id = randomUUID()
    const title = formatTitle(seq, now)

    await db.insert(conversationThreads).values({
      id,
      userId,
      agentId,
      title,
      pinned: false,
      seq,
      createdAt: now,
      updatedAt: now,
    })

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

  static async setPinned(userId: string, id: string, pinned: boolean): Promise<boolean> {
    const updated = await db
      .update(conversationThreads)
      .set({ pinned, updatedAt: Date.now() })
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
      .returning({ id: conversationThreads.id })
    return updated.length > 0
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(conversationThreads)
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
      .returning({ id: conversationThreads.id })
    return deleted.length > 0
  }

  static async touch(userId: string, id: string): Promise<void> {
    await db
      .update(conversationThreads)
      .set({ updatedAt: Date.now() })
      .where(and(eq(conversationThreads.id, id), eq(conversationThreads.userId, userId)))
  }

  static async ownedByUser(userId: string, id: string): Promise<boolean> {
    return (await ConversationService.get(userId, id)) != null
  }
}
