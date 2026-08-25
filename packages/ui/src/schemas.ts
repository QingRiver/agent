import { SelectOptionSchema } from '@agent/proto'
import { z } from 'zod'

/**
 * View 契约（无 interruptId / 无 Transport 细节）。
 * ask_human：Transport 用 @agent/proto InterruptRequest；本文件只描述卡片 props。
 * weather：View 契约只活在本包；graph 工具侧自行声明同形 zod（勿塞进 proto）。
 */

export const AskHumanInputPropsSchema = z.object({
  message: z.string(),
  placeholder: z.string().optional(),
})

export const AskHumanSelectPropsSchema = z.object({
  message: z.string(),
  options: z.array(SelectOptionSchema),
})

export const AskHumanMultiSelectPropsSchema = z.object({
  message: z.string(),
  options: z.array(SelectOptionSchema),
})

export const AskHumanModalPropsSchema = z.object({
  title: z.string(),
  body: z.string(),
  actions: z.array(z.string()),
})

export const AskHumanApprovalPropsSchema = z.object({
  message: z.string(),
  details: z.string(),
})

export const AskHumanUnlockPropsSchema = z.object({
  message: z.string(),
  key: z.string().optional(),
})

export type AskHumanInputProps = z.infer<typeof AskHumanInputPropsSchema>
export type AskHumanSelectProps = z.infer<typeof AskHumanSelectPropsSchema>
export type AskHumanMultiSelectProps = z.infer<typeof AskHumanMultiSelectPropsSchema>
export type AskHumanModalProps = z.infer<typeof AskHumanModalPropsSchema>
export type AskHumanApprovalProps = z.infer<typeof AskHumanApprovalPropsSchema>
export type AskHumanUnlockProps = z.infer<typeof AskHumanUnlockPropsSchema>

export const AskHumanCardNameSchema = z.enum([
  'ask_human_input',
  'ask_human_select',
  'ask_human_multi_select',
  'ask_human_modal',
  'ask_human_approval',
  'ask_human_unlock',
])

export type AskHumanCardName = z.infer<typeof AskHumanCardNameSchema>

/** 对齐 Open-Meteo / get_weather.weather 的扁平展示 props */
export const WeatherCurrentPropsSchema = z.object({
  city: z.string().describe('城市名'),
  country: z.string().optional().describe('国家/地区'),
  temperatureC: z.number().describe('气温（摄氏）'),
  condition: z.string().describe('天气状况文案，如晴、局部多云'),
  observedAt: z.string().optional().describe('观测时间展示文案'),
})

export type WeatherCurrentProps = z.infer<typeof WeatherCurrentPropsSchema>

export const WeatherCardNameSchema = z.enum(['weather_current'])

export type WeatherCardName = z.infer<typeof WeatherCardNameSchema>

/** registry / useComponent / LangGraph tool 同名（须 `^[a-zA-Z0-9_]+$`） */
export const WEATHER_CURRENT_TOOL_NAME = WeatherCardNameSchema.enum.weather_current

export const CardNameSchema = z.enum([
  ...AskHumanCardNameSchema.options,
  ...WeatherCardNameSchema.options,
])

export type CardName = z.infer<typeof CardNameSchema>
