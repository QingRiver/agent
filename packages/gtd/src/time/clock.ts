/**
 * 墙钟瞬时比较（wiki §1.1.1）：不切日界，纯 UTC 瞬时 now 比较。
 *
 * 与 `calendar.ts` 的日历日界/TimeSlice 几何正交：
 * - 墙钟：defer 是否已过、dueSoon、computeStatus overdue、墙钟已解锁 —— 瞬时 now。
 * - 日历日：Forecast 窗、相对日期 token —— 用户 timeZone 半开日窗。
 * 勿混用。
 *
 * SoT：wiki/GTD.md §1.1.1。
 */

/**
 * 墙钟已解锁（wiki §1.1.1）：`deferDate == null || deferDate ≤ now`（瞬时比较）。
 * Forecast 滚动 / 旗标栏使用；推迟栏改用日历日 vs timeslice，勿混用。
 */
export function isWallClockUnlocked(deferDate: string | null | undefined, now: Date): boolean {
  if (deferDate == null)
    return true
  return new Date(deferDate).getTime() <= now.getTime()
}
