import {
  PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
  ProposeDocumentEditsArgsSchema,
} from '@agent/proto'
import { tool } from '@langchain/core/tools'

/** 仅提供 schema 供 bindTools；真正套用在 writeEdit 节点内完成。 */
export const proposeDocumentEditsTool = tool(
  async () => '',
  {
    name: PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
    description:
      '提交一组 SEARCH/REPLACE 补丁以修订文稿。search 须在原文中唯一出现；按 edits 顺序套用。',
    schema: ProposeDocumentEditsArgsSchema,
  },
)
