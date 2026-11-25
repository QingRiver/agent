import type { SkillBinding } from '../context'
import type { SkillBundle } from './bundle'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKILL_ENTRY_FILENAME } from '../spec'
import { readSkillDir } from './bundle'

const __dirname = dirname(fileURLToPath(import.meta.url))
/** 内置 skill 目录：packages/skills/skills/<skill>/ */
const BUILT_IN_SKILLS_ROOT = join(__dirname, '..', '..', 'skills')

let cache: SkillBundle[] | null = null
let loadPromise: Promise<SkillBundle[]> | null = null

/**
 * 加载全部内置 skill（仓库源、只读）。
 * 进程级缓存；首次异步加载，后续同步可读。失败重置允许重试。
 */
export async function loadBuiltInSkills(): Promise<SkillBundle[]> {
  if (cache)
    return cache
  if (!loadPromise) {
    loadPromise = (async () => {
      const entries = readdirSync(BUILT_IN_SKILLS_ROOT, { withFileTypes: true })
      const bundles: SkillBundle[] = []
      for (const e of entries) {
        if (!e.isDirectory())
          continue
        if (e.name.startsWith('.'))
          continue
        bundles.push(await readSkillDir(join(BUILT_IN_SKILLS_ROOT, e.name)))
      }
      cache = bundles
      return bundles
    })()
    loadPromise.catch(() => {
      loadPromise = null
    })
  }
  return loadPromise
}

/** 同步取已加载的内置 skill；未加载完成时返回 null。 */
export function getBuiltInSkill(code: string): SkillBundle | null {
  if (!cache)
    return null
  return cache.find(b => b.code === code) ?? null
}

export interface BuiltInSkillIndex {
  skillText: string
  skillBindings: SkillBinding[]
}

/**
 * 内置 skill 索引：急切 inline **平台级** skill（`autoBind` 未置 false 的）正文（含 refs），
 * 让模型不调 read_skill_file 即拿到规约。
 *
 * `autoBind: false` 的 skill（如 writing_editor / patch_edit，编辑器域）不进 reactAgent 平台索引——
 * 它们由对应图（editorGraph）经专门 loader 取用，避免给通用助手注入编辑器噪声。
 * 与用户 skill 的懒加载（formatSkillContext 只给 code+desc）区分。
 */
export async function composeBuiltInSkillIndex(): Promise<BuiltInSkillIndex> {
  const bundles = (await loadBuiltInSkills()).filter(b => b.frontmatter.autoBind !== false)
  if (bundles.length === 0)
    return { skillText: '', skillBindings: [] }
  const skillText = bundles.map(renderBundleInline).join('\n\n')
  const skillBindings: SkillBinding[] = bundles.map(b => ({
    code: b.code,
    ...(b.name ? { name: b.name } : {}),
    strategy: 'latest',
  }))
  return { skillText, skillBindings }
}

function renderBundleInline(b: SkillBundle): string {
  const parts: string[] = [`## Skill: ${b.code}`]
  if (b.description)
    parts.push(`> ${b.description}`, '')
  parts.push(b.body.trim())
  for (const [path, content] of Object.entries(b.files)) {
    if (path === SKILL_ENTRY_FILENAME)
      continue
    // 工具声明 / 脚本源码不进 system prompt（运行时物化调用，非指令内容）
    if (path.startsWith('tools/') || path.startsWith('mcp/') || path.startsWith('scripts/'))
      continue
    parts.push('', `### ${path}`, content.trim())
  }
  return parts.join('\n')
}
