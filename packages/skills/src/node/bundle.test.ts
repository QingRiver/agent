import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSkillDir, writeSkillDir } from './bundle'

describe('writeSkillDir round-trip', () => {
  it('readSkillDir → writeSkillDir → readSkillDir 保持 code 与文件内容', async () => {
    const src = mkdtempSync(join(tmpdir(), 'skill-rt-'))
    writeFileSync(join(src, 'SKILL.md'), '---\nname: my_skill\ndescription: 测试\n---\n# 正文\n')
    mkdirSync(join(src, 'refs'), { recursive: true })
    writeFileSync(join(src, 'refs', 'note.md'), '附属内容')
    const dest = mkdtempSync(join(tmpdir(), 'skill-rt-out-'))
    try {
      const bundle = await readSkillDir(src)
      expect(bundle.code).toBe('my_skill')
      await writeSkillDir(bundle, dest)

      const reread = await readSkillDir(dest)
      expect(reread.code).toBe('my_skill')
      expect(reread.body).toBe(bundle.body)
      expect(reread.files['refs/note.md']).toBe('附属内容')
    }
    finally {
      rmSync(src, { recursive: true, force: true })
      rmSync(dest, { recursive: true, force: true })
    }
  })

  it('拒绝越界文件路径', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'skill-escape-'))
    try {
      await expect(writeSkillDir({ files: { '../escape.md': 'x' } }, dest)).rejects.toThrow(/越界|非法/)
    }
    finally {
      rmSync(dest, { recursive: true, force: true })
    }
  })
})
