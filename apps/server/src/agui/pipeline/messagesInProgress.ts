interface MessageInProgress {
  id: string
  toolCallId?: string | null
  toolCallName?: string | null
}

type MessagesInProgressRecord = Record<string, MessageInProgress | null>

export interface StreamMapContext {
  messagesInProgress: MessagesInProgressRecord
  emittedToolCallStartIds: Set<string>
}

export function createStreamMapContext(): StreamMapContext {
  return {
    messagesInProgress: {},
    emittedToolCallStartIds: new Set(),
  }
}

export function getMessageInProgress(
  ctx: StreamMapContext,
  runId: string,
): MessageInProgress | null {
  return ctx.messagesInProgress[runId] ?? null
}

export function setMessageInProgress(
  ctx: StreamMapContext,
  runId: string,
  data: MessageInProgress,
): void {
  ctx.messagesInProgress[runId] = { ...ctx.messagesInProgress[runId], ...data }
}

export function clearMessageInProgress(ctx: StreamMapContext, runId: string): void {
  ctx.messagesInProgress[runId] = null
}
