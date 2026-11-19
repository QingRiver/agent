import type { GraphsName } from '@agent/graph'
import { Graphs, setSkillFileLoader } from '@agent/graph'
import { getCheckpointer } from '../db/checkpointer'
import { SkillService } from '../service/skill'

type AnyGraph = (typeof Graphs)[GraphsName]
export type CompiledGraphApp = ReturnType<AnyGraph['compile']>

const graphCache = new Map<GraphsName, CompiledGraphApp>()

/** 进程启动时显式调用；避免 import graphAgents 时产生副作用 */
export function initGraphRuntime(): void {
  setSkillFileLoader(async ({ userId, skillCode }) => SkillService.walkFiles(userId, skillCode))
}

export function getGraphApp(name: GraphsName): CompiledGraphApp {
  const cached = graphCache.get(name)
  if (cached)
    return cached

  const compiled = Graphs[name].compile({
    checkpointer: getCheckpointer(),
  })
  graphCache.set(name, compiled)
  return compiled
}
