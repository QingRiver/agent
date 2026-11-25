import { describe, expect, it } from 'vitest'
import {
  canonicalSkillCode,
  formatSkillContext,
  isReservedSkillCode,
  normalizeSkillPath,
  parseFrontmatter,
  readSkillFile,
  resolveBoundSkillCode,
  serializeFrontmatter,
  SKILL_ENTRY_FILENAME,
  slugifySkillCode,
} from './index'

describe('parseFrontmatter', () => {
  it('parses name/description with LF', () => {
    const parsed = parseFrontmatter('---\nname: 天气\ndescription: 查天气\n---\n正文')
    expect(parsed.name).toBe('天气')
    expect(parsed.description).toBe('查天气')
    expect(parsed.body).toBe('正文')
  })

  it('parses CRLF frontmatter', () => {
    const parsed = parseFrontmatter('---\r\nname: Weather\r\ndescription: lookup\r\n---\r\nbody')
    expect(parsed.name).toBe('Weather')
    expect(parsed.description).toBe('lookup')
    expect(parsed.body).toBe('body')
  })

  it('returns full content as body when no frontmatter', () => {
    const parsed = parseFrontmatter('# hello\nworld')
    expect(parsed.name).toBeUndefined()
    expect(parsed.body).toBe('# hello\nworld')
  })

  it('preserves extension fields in raw (allowed-tools etc.)', () => {
    const parsed = parseFrontmatter(
      '---\nname: foo\ndescription: bar\nallowed-tools:\n  - bash\n  - edit\nextra: 42\n---\nbody',
    )
    expect(parsed.name).toBe('foo')
    expect(parsed.raw['allowed-tools']).toEqual(['bash', 'edit'])
    expect(parsed.raw.extra).toBe(42)
  })

  it('does not throw on malformed yaml', () => {
    const parsed = parseFrontmatter('---\nname: [unclosed\n---\nbody')
    expect(parsed.body).toBe('body')
    expect(parsed.raw).toEqual({})
  })
})

describe('serializeFrontmatter', () => {
  it('round-trips name/description and body', () => {
    const text = serializeFrontmatter(
      { name: 'html_card', description: 'render card' },
      '# body',
    )
    expect(text).toContain('name: html_card')
    expect(text).toContain('description: render card')
    expect(text).toContain('# body')
    const reparsed = parseFrontmatter(text)
    expect(reparsed.name).toBe('html_card')
    expect(reparsed.description).toBe('render card')
    expect(reparsed.body).toBe('# body')
  })
})

describe('normalizeSkillPath', () => {
  it('defaults empty to SKILL.md and allows nested slash', () => {
    expect(normalizeSkillPath(undefined)).toEqual({ ok: true, path: SKILL_ENTRY_FILENAME })
    expect(normalizeSkillPath('scripts/a.md')).toEqual({ ok: true, path: 'scripts/a.md' })
    expect(normalizeSkillPath('./foo.md')).toEqual({ ok: true, path: 'foo.md' })
  })

  it('rejects .. and absolute paths', () => {
    expect(normalizeSkillPath('../x.md')).toEqual({ ok: false, error: 'SKILL_PATH_ESCAPE' })
    expect(normalizeSkillPath('a/../../b.md')).toEqual({ ok: false, error: 'SKILL_PATH_ESCAPE' })
    expect(normalizeSkillPath('/etc/passwd.md')).toEqual({ ok: false, error: 'SKILL_PATH_ABSOLUTE' })
  })

  it('rejects unsupported extension', () => {
    expect(normalizeSkillPath('bin.exe')).toEqual({ ok: false, error: 'SKILL_TYPE_UNSUPPORTED' })
  })

  it('allows common skill script extensions', () => {
    expect(normalizeSkillPath('scripts/run.mjs').ok).toBe(true)
    expect(normalizeSkillPath('scripts/run.py').ok).toBe(true)
    expect(normalizeSkillPath('scripts/run.sh').ok).toBe(true)
  })
})

describe('readSkillFile', () => {
  it('returns content or LLM-visible error codes', () => {
    const files = { 'SKILL.md': 'hello', 'scripts/a.md': 'note' }
    expect(readSkillFile(files, 'SKILL.md')).toBe('hello')
    expect(readSkillFile(files, 'scripts/a.md')).toBe('note')
    expect(readSkillFile(files, '../x.md')).toContain('SKILL_PATH_ESCAPE')
    expect(readSkillFile(files, 'missing.md')).toContain('SKILL_FILE_NOT_FOUND')
    expect(readSkillFile(null, 'SKILL.md')).toContain('SKILL_NOT_BOUND')
  })
})

describe('formatSkillContext', () => {
  it('includes name/code/description and read hint, not file list', () => {
    const text = formatSkillContext([
      { name: '天气', code: 'weather', description: '查天气' },
    ])
    expect(text).toContain('`weather`')
    expect(text).toContain('查天气')
    expect(text).toContain('read_skill_file')
    expect(text).not.toContain('scripts/a.md')
    expect(text).not.toContain('manifest.json')
  })
})

describe('resolveBoundSkillCode', () => {
  const bindings = [
    { code: 'skill', name: 'bark' },
    { code: 'weather', name: '天气' },
  ]

  it('matches code, then unique display name', () => {
    expect(resolveBoundSkillCode('skill', bindings)).toBe('skill')
    expect(resolveBoundSkillCode('bark', bindings)).toBe('skill')
    expect(resolveBoundSkillCode('天气', bindings)).toBe('weather')
  })

  it('returns null when unbound or name is ambiguous', () => {
    expect(resolveBoundSkillCode('nope', bindings)).toBeNull()
    expect(resolveBoundSkillCode('bark', [
      { code: 'skill', name: 'bark' },
      { code: 'bark_v2', name: 'bark' },
    ])).toBeNull()
  })
})

describe('slugifySkillCode', () => {
  it('slugifies and avoids reserved names', () => {
    expect(slugifySkillCode('My Weather')).toBe('my_weather')
    expect(isReservedSkillCode('kb_search')).toBe(true)
    expect(slugifySkillCode('kb_search')).toBe('s_kb_search')
  })

  it('avoids the built-in html_card code', () => {
    expect(isReservedSkillCode('html_card')).toBe(true)
    expect(slugifySkillCode('html_card')).toBe('s_html_card')
  })
})

describe('canonicalSkillCode', () => {
  it('accepts latin slug, rejects chinese and reserved', () => {
    expect(canonicalSkillCode('bark')).toBe('bark')
    expect(canonicalSkillCode('Bark')).toBe('bark')
    expect(canonicalSkillCode('天气')).toBeNull()
    expect(canonicalSkillCode('kb_search')).toBeNull()
    expect(canonicalSkillCode('html_card')).toBeNull()
  })
})
