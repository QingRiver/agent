import { useCallback, useDeferredValue, useRef, useState } from 'react'

export interface StreamingBuffer {
  /** 渲染用的延迟快照（可能略落后于真相，这正是无闪烁的关键） */
  buffer: string
  /** 追加一个 token，即时更新 ref，微任务合批后落 state */
  append: (chunk: string) => void
  /** 取出当前完整内容并清空，用于"流结束 → 冻结进 scrollback" */
  commit: () => string
  /** 清空 buffer */
  reset: () => void
  /** 当前渲染是否落后于真相（流式中为 true） */
  isStale: boolean
}

export function useStreamingBuffer(): StreamingBuffer {
  const [buffer, setBuffer] = useState('')
  // ref 是真相，state 是渲染投影（Zustand 模式）
  const ref = useRef('')
  // 合批标记：当前微任务内已调度则不再调度
  const scheduledRef = useRef(false)

  const flush = useCallback(() => {
    scheduledRef.current = false
    setBuffer(ref.current) // 传计算值，last-write-wins
  }, [])

  const append = useCallback((chunk: string) => {
    ref.current += chunk // 即时更新真相
    if (!scheduledRef.current) {
      scheduledRef.current = true
      // 微任务合批：高频 token 只产生一次渲染
      queueMicrotask(flush)
    }
  }, [flush])

  const commit = useCallback(() => {
    const content = ref.current
    ref.current = ''
    scheduledRef.current = false
    setBuffer('')
    return content
  }, [])

  const reset = useCallback(() => {
    ref.current = ''
    scheduledRef.current = false
    setBuffer('')
  }, [])

  // useDeferredValue：渲染用延迟快照，React 用旧帧保底，流式不阻塞
  const deferred = useDeferredValue(buffer)

  return {
    buffer: deferred,
    append,
    commit,
    reset,
    isStale: buffer !== deferred,
  }
}
