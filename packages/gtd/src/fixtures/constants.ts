/**
 * 共享测试/Storybook 常量。
 * 既是单测的"当前时刻"基准，也是 Storybook 故事的稳定时间锚点。
 */

/** 固定的"现在"——所有场景与单测以此刻为基准，保证可重现。 */
export const NOW = new Date('2026-07-16T12:00:00Z')
export const NOW_ISO = NOW.toISOString()

/** due 临近阈值：2 天（与 availability/forecast 的 due_soon 口径一致）。 */
export const DUE_SOON_MS = 2 * 24 * 60 * 60 * 1000

/** 相对 NOW 的 ISO 偏移工具（正数未来、负数过去，单位毫秒）。 */
export function isoFromNow(deltaMs: number): string {
  return new Date(NOW.getTime() + deltaMs).toISOString()
}
