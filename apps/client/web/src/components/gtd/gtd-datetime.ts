/** 推迟/计划默认：日初；截止默认：日末（精度到分） */
export const GTD_TIME_START_OF_DAY = '00:00'
export const GTD_TIME_END_OF_DAY = '23:59'

/** 用户本地时区当日 00:00 的 ISO 瞬时 */
export function startOfLocalDayIso(from: Date = new Date()): string {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
