import { readSkillBody } from './skillBody'

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 读 tushare skill 的 SKILL.md body 并渲染 `${to_day}` 为今日 YYYYMMDD。
 * 单一源在 skill 目录；tushareGraph 与 CLI 经此取 system prompt。
 */
export function getTusharePrompt(): string {
  // eslint-disable-next-line no-template-curly-in-string -- '${to_day}' 是 SKILL.md 模板占位符
  return readSkillBody('tushare').replaceAll('${to_day}', todayYmd())
}
