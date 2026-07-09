/** 一条 AI 修订建议(MR),供右侧面板渲染。from/to 为 CM doc 位置,tr.changes.mapPos 追踪 */
export interface Suggestion {
  sid: string
  summary: string
  originalText: string
  newText: string
  /** CM doc 位置;用户编辑后由 StateField.update 经 mapPos 自动平移 */
  from: number
  to: number
  /** 区间当前文本 != originalText → 建议失效 */
  stale: boolean
}
