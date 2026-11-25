/**
 * @agent/skills —— skill 领域包（规范 + 内置目录）。
 *
 * 单包两层：
 *  - 主入口（本文件）：同构规范层（spec / code / frontmatter / path / context），无 fs，
 *    可被浏览器与外部 agent 复用。`SkillBinding` 等类型规范层在此。
 *  - `@agent/skills/node`：fs 读写 + 内置 skill 注册（readSkillDir / builtInSkills / codeCard），
 *    仅 server / CLI 使用，不进浏览器 bundle。
 *
 * 跨 agent 互操作的事实标准：一个 skill = 一个目录，入口 `SKILL.md`
 * （YAML frontmatter + markdown body）+ 任意相对路径支持文件。
 * 内置 skill 目录见包根 `skills/<skill>/`。
 */
export * from './code'
export * from './context'
export * from './frontmatter'
export * from './path'
export * from './spec'
