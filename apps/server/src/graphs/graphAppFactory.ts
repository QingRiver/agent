import type { CompiledStateGraph } from '@langchain/langgraph'
import type { AguiTransformerGraphApp } from '../agent/streamGraphAguiEvents'
import type { CheckpointerMode } from './checkpointer'
import {
  aguiTransformerFactory,
  hitlGraph,
  obsidianGraph,
  simpleGraph,
  simpleToolCallGraph,
  weatherGraph,
} from '@agent/graph'
import { getRequestContext } from '../context/requestContext'
import { getCheckpointer } from './checkpointer'

export type AguiGraphName
  = | 'simple'
    | 'simpleToolCall'
    | 'weather'
    | 'obsidian'
    | 'hitl'

export type RawGraphName = 'simpleRaw' | 'weatherRaw' | 'obsidianRaw'

const aguiCache = new Map<string, AguiTransformerGraphApp>()
const rawCache = new Map<string, CompiledStateGraph<unknown, unknown>>()

function resolveMode(mode?: CheckpointerMode): CheckpointerMode {
  return mode ?? getRequestContext().mode
}

function cacheKey(name: string, mode: CheckpointerMode): string {
  return `${name}:${mode}`
}

export function getAguiGraphApp(name: AguiGraphName, mode?: CheckpointerMode): AguiTransformerGraphApp {
  const resolvedMode = resolveMode(mode)
  const key = cacheKey(name, resolvedMode)
  const cached = aguiCache.get(key)
  if (cached)
    return cached

  const checkpointer = getCheckpointer(resolvedMode)
  let compiled: AguiTransformerGraphApp

  switch (name) {
    case 'simple':
      compiled = simpleGraph.compile({
        checkpointer,
        transformers: [aguiTransformerFactory],
      }) as AguiTransformerGraphApp
      break
    case 'simpleToolCall':
      compiled = simpleToolCallGraph.compile({
        checkpointer,
        transformers: [aguiTransformerFactory],
      }) as AguiTransformerGraphApp
      break
    case 'weather':
      compiled = weatherGraph.compile({
        checkpointer,
        transformers: [aguiTransformerFactory],
      }) as AguiTransformerGraphApp
      break
    case 'obsidian':
      compiled = obsidianGraph.compile({
        checkpointer,
        transformers: [aguiTransformerFactory],
      }) as AguiTransformerGraphApp
      break
    case 'hitl':
      compiled = hitlGraph.compile({
        checkpointer,
        transformers: [aguiTransformerFactory],
      }) as AguiTransformerGraphApp
      break
  }

  aguiCache.set(key, compiled)
  return compiled
}

export function getRawGraphApp(name: RawGraphName, mode: CheckpointerMode = 'guest'): CompiledStateGraph<unknown, unknown> {
  const key = cacheKey(name, mode)
  const cached = rawCache.get(key)
  if (cached)
    return cached

  const checkpointer = getCheckpointer(mode)
  let compiled: CompiledStateGraph<unknown, unknown>

  switch (name) {
    case 'simpleRaw':
      compiled = simpleGraph.compile({ checkpointer }) as CompiledStateGraph<unknown, unknown>
      break
    case 'weatherRaw':
      compiled = weatherGraph.compile({ checkpointer }) as CompiledStateGraph<unknown, unknown>
      break
    case 'obsidianRaw':
      compiled = obsidianGraph.compile({ checkpointer }) as CompiledStateGraph<unknown, unknown>
      break
  }

  rawCache.set(key, compiled)
  return compiled
}
