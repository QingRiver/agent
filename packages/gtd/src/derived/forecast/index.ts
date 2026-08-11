/**
 * Forecast 领域：TimeSlice + 栏位正交 + tier 去重。
 * 日历 / TimeSlice 几何与墙钟解锁见 ../time.ts；预设条 → stripToTimeSlice。
 * SoT：wiki/GTD.md §1.1.1。
 *
 * | 文件 | 职责 |
 * |------|------|
 * | `types` | options / LaneHit（TimeSlice 自 ../time 再导出） |
 * | `strip` | 预设 → timeslice（点选交互在 client） |
 * | `strip-offsets` | 命名日相对今日偏移 |
 * | `block-key` | 日始 → Forecast 块键 |
 * | `lanes` | 各栏 mermaid 对应纯函数 |
 * | `assign` | pickByTier + assignForecastBlock |
 * | `render` | 吸顶分块渲染与块内序 |
 */
export * from './assign'
export * from './lanes'
export * from './render'
export * from './strip'
export * from './types'
