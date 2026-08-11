/**
 * 日期 / 周期算术（L2 time）：纯日期比较与周期终止谓词。
 *
 * 与 `calendar.ts`（用户时区日界/TimeSlice 几何）正交：本文件只做 UTC 瞬时算术与
 * 重复规则的周期耗尽判定，不切日界。
 *
 * SoT：wiki/GTD.md §1.1.1。
 */
import type { RepeatRule } from '../data/schema'

/** 是否终止重复（completedOccurrences>=maxOccurrences 或 now>endDate）。 */
export function shouldStop(rule: RepeatRule, now: Date): boolean {
  if (rule.maxOccurrences != null && rule.completedOccurrences >= rule.maxOccurrences)
    return true
  if (rule.endDate && now.getTime() > new Date(rule.endDate).getTime())
    return true
  return false
}
