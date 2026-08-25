import type { ComponentType } from 'react'
import type { CardName } from './schemas'
import {
  AskHumanApprovalCard,
  AskHumanInputCard,
  AskHumanModalCard,
  AskHumanMultiSelectCard,
  AskHumanSelectCard,
  AskHumanUnlockCard,
} from './cards/ask-human'
import { WeatherCurrentCard } from './cards/weather'

/**
 * 对话卡片注册表 —— View 层唯一入口。
 * key 一律 `[a-zA-Z0-9_]+`（与 OpenAI tool name 规则对齐，禁止 `.`）。
 * HITL（interrupt）与后续 useComponent JSON 注水共用同一张表。
 */
export const cardRegistry = {
  ask_human_input: AskHumanInputCard,
  ask_human_select: AskHumanSelectCard,
  ask_human_multi_select: AskHumanMultiSelectCard,
  ask_human_modal: AskHumanModalCard,
  ask_human_approval: AskHumanApprovalCard,
  ask_human_unlock: AskHumanUnlockCard,
  weather_current: WeatherCurrentCard,
} as const satisfies Record<CardName, ComponentType<any>>

export type CardRegistry = typeof cardRegistry

export function getCard(name: string): ComponentType<any> | undefined {
  if (name in cardRegistry)
    return cardRegistry[name as keyof CardRegistry]
  return undefined
}
