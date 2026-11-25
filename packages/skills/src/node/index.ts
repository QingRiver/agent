/**
 * @agent/skills/node —— fs 读写 + 内置 skill 注册（系统 tier）。
 *
 * 仅 server / CLI 使用；主入口 `@agent/skills` 是同构的，无 fs。
 */
export {
  type BuiltInSkillIndex,
  composeBuiltInSkillIndex,
  getBuiltInSkill,
  loadBuiltInSkills,
} from './builtInSkills'
export { readSkillDir, type SkillBundle, type SkillMcpDecl, type SkillToolDecl, writeSkillDir } from './bundle'
export { CODE_CARD_SYSTEM_PROMPT } from './codeCard'
export {
  EDITOR_ASK_MODE_RULES,
  EDITOR_CAPABILITIES,
  EDITOR_CLASSIFY_INTENT_PROMPT,
  EDITOR_CONSTITUTION,
  EDITOR_SUMMARY_RULES,
  EDITOR_WRITE_DOCUMENT_PREFIX,
  EDITOR_WRITE_INLINE_PREFIX,
} from './editorSegments'
export { readSkillBody } from './skillBody'
export { getTusharePrompt } from './tusharePrompt'
