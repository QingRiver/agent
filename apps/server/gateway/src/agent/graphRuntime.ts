import type { GraphsName } from '@agent/graph'
import { Graphs, setSkillFileLoader } from '@agent/graph'
import { loadBuiltInSkills } from '@agent/skills/node'
import { getCheckpointer } from '../db/checkpointer'
import { SkillService } from '../service/skill'

type AnyGraph = (typeof Graphs)[GraphsName]
export type CompiledGraphApp = ReturnType<AnyGraph['compile']>

const graphCache = new Map<GraphsName, CompiledGraphApp>()

/** 进程启动时显式调用；避免 import graphAgents 时产生副作用 */
export function initGraphRuntime(): void {
  setSkillFileLoader(async ({ userId, skillCode }) => SkillService.walkFiles(userId, skillCode))
  // 预热内置 skill 缓存（仓库源、只读），供 read_skill_file 同步直读
  loadBuiltInSkills().catch((err) => {
    console.error('[graphRuntime] loadBuiltInSkills 失败:', err)
  })
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
