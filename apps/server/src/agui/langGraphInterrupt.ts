export interface GraphTaskInterrupt {
  id?: string
  value?: unknown
}

/** 挂起判定以 getState 为准 */
export function getFirstActiveInterrupt(
  snapshot: { tasks: ReadonlyArray<{ interrupts: ReadonlyArray<GraphTaskInterrupt> }> },
): GraphTaskInterrupt | undefined {
  for (const task of snapshot.tasks) {
    const first = task.interrupts[0]
    if (!first)
      continue
    const interrupt: GraphTaskInterrupt = {}
    if (first.id != null)
      interrupt.id = first.id
    if (first.value !== undefined)
      interrupt.value = first.value
    return interrupt
  }
  return undefined
}

export function graphConfigFromThreadId(threadId: string) {
  return { configurable: { thread_id: threadId } }
}
