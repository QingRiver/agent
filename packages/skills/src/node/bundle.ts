import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { isValidSkillSlug, slugifySkillCode } from '../code'
import { parseFrontmatter } from '../frontmatter'
import { normalizeSkillPath } from '../path'
import { ALLOWED_EXTS, SKILL_ENTRY_FILENAME } from '../spec'

/**
 * Skill 声明的脚本工具（`tools/<name>.tool.json`）。
 * 运行时 spawn `node <skillDir>/<run>`，stdin 传 JSON args，stdout 作为工具返回。
 */
export interface SkillToolDecl {
  /** LangChain 工具名 */
  name: string
  description: string
  /** JSON Schema（input） */
  inputSchema: { type: 'object', properties?: Record<string, unknown>, required?: string[] }
  /** 相对 skill 根的可执行脚本路径 */
  run: string
}

/**
 * Skill 声明的 MCP 工具集（`mcp/<id>.mcp.json`）。
 * 运行时按声明连接 MCP，工具名由 listTools 决定。secret 不进声明，按 `tokenEnv` 从环境取，
 * 拼进 `url` / `headers` 的 `${token}` 占位符。
 */
export interface SkillMcpDecl {
  /** 标识名（非工具名） */
  id: string
  transport: 'streamable-http'
  /** 完整 URL 字面量（可含 `${token}`）；与 `urlEnv` 二选一 */
  url?: string
  /** 从 process.env[urlEnv] 取 base URL；与 `url` 二选一（HA 等动态地址） */
  urlEnv?: string
  /** urlEnv 模式下追加的路径，如 "/api/mcp" */
  urlSuffix?: string
  tokenEnv?: string
  headers?: Record<string, string>
  /** 对 GET 返回 405（绕 SSE 长连接，Tushare 等需要） */
  postOnlyGet?: boolean
}

/**
 * Skill 目录在磁盘上的完整快照（跨 agent 互操作的基本单元）。
 * - `code`：从 frontmatter name 解析的 slug；非法时回退到 codeHint / slugify。
 * - `frontmatter`：完整 YAML（含 allowed-tools 等扩展字段）。
 * - `files`：相对 skill 根的 posix 路径 → 文本内容，含 `SKILL.md` 自身。
 * - `dir`：skill 目录绝对路径，供脚本工具 spawn 定位。
 * - `tools` / `mcp`：从 `tools/*.tool.json` / `mcp/*.mcp.json` 解析的声明。
 *
 * 该结构即 Claude Code 等 agent 可直接消费的 skill 目录形态。
 */
export interface SkillBundle {
  code: string
  name: string
  description: string
  frontmatter: Record<string, unknown>
  body: string
  files: Record<string, string>
  dir: string
  tools: SkillToolDecl[]
  mcp: SkillMcpDecl[]
}

function toPosix(p: string): string {
  return p.split(sep).join('/')
}

function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

/** 解析 tools/*.tool.json → SkillToolDecl[] */
function parseToolDecls(files: Record<string, string>): SkillToolDecl[] {
  const out: SkillToolDecl[] = []
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('tools/') || !path.endsWith('.tool.json'))
      continue
    try {
      const raw = JSON.parse(content) as Record<string, unknown>
      if (typeof raw.name !== 'string' || typeof raw.run !== 'string')
        continue
      out.push({
        name: raw.name,
        description: typeof raw.description === 'string' ? raw.description : `skill 工具: ${raw.name}`,
        inputSchema: (raw.inputSchema ?? { type: 'object' }) as SkillToolDecl['inputSchema'],
        run: raw.run,
      })
    }
    catch {
      // 畸形 tool.json 跳过
    }
  }
  return out
}

/** 解析 mcp/*.mcp.json → SkillMcpDecl[] */
function parseMcpDecls(files: Record<string, string>): SkillMcpDecl[] {
  const out: SkillMcpDecl[] = []
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('mcp/') || !path.endsWith('.mcp.json'))
      continue
    try {
      const raw = JSON.parse(content) as Record<string, unknown>
      if (typeof raw.id !== 'string' || (typeof raw.url !== 'string' && typeof raw.urlEnv !== 'string'))
        continue
      out.push({
        id: raw.id,
        transport: 'streamable-http',
        ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
        ...(typeof raw.urlEnv === 'string' ? { urlEnv: raw.urlEnv } : {}),
        ...(typeof raw.urlSuffix === 'string' ? { urlSuffix: raw.urlSuffix } : {}),
        ...(typeof raw.tokenEnv === 'string' ? { tokenEnv: raw.tokenEnv } : {}),
        ...(raw.headers && typeof raw.headers === 'object' ? { headers: raw.headers as Record<string, string> } : {}),
        ...(raw.postOnlyGet === true ? { postOnlyGet: true } : {}),
      })
    }
    catch {
      // 畸形 mcp.json 跳过
    }
  }
  return out
}

/** 递归读取目录下所有白名单后缀的文本文件，键为相对 posix 路径。 */
async function walkTextFiles(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  async function recurse(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.'))
        continue
      const abs = join(dir, e.name)
      if (e.isDirectory()) {
        await recurse(abs)
      }
      else if (e.isFile()) {
        if (!ALLOWED_EXTS.has(extOf(e.name)))
          continue
        const rel = toPosix(relative(root, abs))
        out[rel] = await readFile(abs, 'utf8')
      }
    }
  }
  await recurse(root)
  return out
}

/**
 * 读取一个 skill 目录为 SkillBundle。
 * - 必须存在 `SKILL.md` 入口，否则抛错。
 * - code 优先取 frontmatter `name`（形态合法即用，含保留名——内置 skill 自身即保留码）；
 *   非法时用 codeHint / slugify(name)。用户层创建同名保留码的拦截在 SkillService，不在读取层。
 * - secret 永远不读进 bundle（MCP/脚本所需 token 只在运行时按 `tokenEnv` 从环境取）。
 */
export async function readSkillDir(dir: string, codeHint?: string): Promise<SkillBundle> {
  const files = await walkTextFiles(dir)
  const entry = files[SKILL_ENTRY_FILENAME]
  if (entry == null)
    throw new Error(`skill 目录缺少 ${SKILL_ENTRY_FILENAME}: ${dir}`)

  const fm = parseFrontmatter(entry)
  const rawName = fm.name?.trim()
  const name = rawName || codeHint || 'skill'
  const code = (rawName && isValidSkillSlug(rawName))
    ? rawName.toLowerCase()
    : (codeHint ?? slugifySkillCode(name))
  const description = fm.description?.trim() ?? ''

  return {
    code,
    name,
    description,
    frontmatter: fm.raw,
    body: fm.body,
    files,
    dir,
    tools: parseToolDecls(files),
    mcp: parseMcpDecls(files),
  }
}

/**
 * 把 SkillBundle 写成目录（export 用）。
 * - `destDir` 不存在则递归创建。
 * - `files`（含 SKILL.md）逐个按相对 posix 路径写入；路径不得越界（防 `..`）。
 * - `tools`/`mcp` 声明文件若已在 `files` 中则原样写出，否则不补（export 只搬内容）。
 */
export async function writeSkillDir(bundle: Pick<SkillBundle, 'files'>, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })
  for (const [rel, content] of Object.entries(bundle.files)) {
    const norm = normalizeSkillPath(rel)
    if (!norm.ok)
      throw new Error(`skill 文件路径非法（${rel}: ${norm.error}）`)
    const abs = resolve(join(destDir, norm.path))
    if (relative(destDir, abs).startsWith('..'))
      throw new Error(`skill 文件路径越界（${rel}）`)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
}
