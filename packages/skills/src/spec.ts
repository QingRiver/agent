/**
 * Skill 规范常量。
 *
 * 本模块是纯常量 + 纯函数，无 fs / 无 agent 依赖，可被浏览器与外部 agent 复用。
 * 跨 agent 互操作的事实标准：skill = 一个目录，入口 `SKILL.md`（YAML frontmatter + markdown body）
 * + 任意相对路径支持文件。frontmatter 的 name/description 通用必填，扩展字段（allowed-tools 等）透传。
 */

/** skill 目录入口文件名（相对 skill 根） */
export const SKILL_ENTRY_FILENAME = 'SKILL.md'

/** read_skill_file 工具名（与 graph 工具一致） */
export const READ_SKILL_FILE_TOOL_NAME = 'read_skill_file'

/** version_text.type：用途枚举（不参与同名唯一） */
export const VERSION_TEXT_TYPE = {
  SKILL: 'skill',
  PROMPT: 'prompt',
  CONFIG: 'config',
} as const

export type VersionTextType = (typeof VERSION_TEXT_TYPE)[keyof typeof VERSION_TEXT_TYPE]

export const VERSION_TEXT_TYPES = [
  VERSION_TEXT_TYPE.SKILL,
  VERSION_TEXT_TYPE.PROMPT,
  VERSION_TEXT_TYPE.CONFIG,
] as const

/**
 * 系统保留 skill code：内置 skill 与系统工具名，用户不得自建同名。
 * 内置 skill（系统 tier，仓库源、只读）：
 *  - `html_card`：HTML 沙箱卡片写作规约
 *  - `rag_cite`：检索引用纪律
 *  - `clarify_ask`：主动提问纪律
 *  - `writing_editor`：中文写作编辑助手纪律
 *  - `patch_edit`：SEARCH/REPLACE 补丁编辑规约
 *  - `weather`：天气查询（声明 get_weather 脚本工具）
 *  - `tushare`：A 股行情分析（声明 Tushare MCP）
 *  - `home_assistant`：智能家居控制（声明 HA MCP）
 */
export const RESERVED_SKILL_CODES = [
  'kb_search',
  'ask_input',
  'ask_choice',
  'ask_multi_choice',
  'ask_confirm',
  READ_SKILL_FILE_TOOL_NAME,
  'html_card',
  'rag_cite',
  'clarify_ask',
  'writing_editor',
  'patch_edit',
  'weather',
  'tushare',
  'home_assistant',
] as const

const RESERVED_SET = new Set<string>(RESERVED_SKILL_CODES)

export function isReservedSkillCode(code: string): boolean {
  return RESERVED_SET.has(code)
}

/**
 * read_skill_file 允许读取的文本后缀白名单。
 * 覆盖 Claude Code skill 常见文件：markdown / 配置 / 脚本 / 数据。
 * 二进制（图片等）不在内——read_skill_file 只返回字符串。
 */
export const ALLOWED_EXTS = new Set([
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.ts',
  '.mts',
  '.js',
  '.mjs',
  '.cjs',
  '.txt',
  '.csv',
  '.py',
  '.sh',
])
