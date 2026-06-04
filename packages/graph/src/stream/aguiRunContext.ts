import type { AguiFinalizeContext } from './aguiTransformer.js'

/** 当前 v3 streamEvents 运行的 finalize 上下文（单进程 dev 足够；并发同 thread 需 checkpointer 隔离） */
export const aguiRunContext: { current?: AguiFinalizeContext | undefined } = {}
