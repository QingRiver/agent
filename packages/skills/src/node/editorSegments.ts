import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WRITING_EDITOR_REFS = join(__dirname, '..', '..', 'skills', 'writing-editor', 'refs')

/**
 * editorGraph 的 system prompt 各段，从 writing-editor skill 的 refs 同步加载。
 * 内容是 editorPrompts.ts 的单一源；改 prompt 即改 ref 文件，不必动 TS。
 * 行为对齐原 editorPrompts.ts 常量（拼接方式见 editorPrompts.buildWriteSystemPrompt 等）。
 */
function ref(name: string): string {
  return readFileSync(join(WRITING_EDITOR_REFS, name), 'utf8').trim()
}

export const EDITOR_CONSTITUTION = ref('constitution.md')
export const EDITOR_ASK_MODE_RULES = ref('ask-mode.md')
export const EDITOR_CAPABILITIES = ref('capabilities.md')
export const EDITOR_WRITE_INLINE_PREFIX = ref('write-inline.md')
export const EDITOR_WRITE_DOCUMENT_PREFIX = ref('write-document.md')
export const EDITOR_CLASSIFY_INTENT_PROMPT = ref('classify-intent.md')
export const EDITOR_SUMMARY_RULES = ref('summary.md')
