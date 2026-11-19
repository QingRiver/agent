import type { EditorEditCase } from '@agent/proto'

export interface EditorFocus {
  text: string
  from?: number
  to?: number
}

export interface WriteEditInput {
  editCase: EditorEditCase
  /** document：纯全文基线；inline：可选 */
  documentBaseline?: string
  polishInstruction?: string
  focuses?: EditorFocus[]
  /** inline 时通常为带 <focus> 的全文 */
  humanContent?: string
  /** document：chat Write 开思考；job 关 */
  reasoning?: boolean
}
