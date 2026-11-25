import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { materializeSkillTools } from './materializeSkillTools'

describe('materializeSkillTools', () => {
  it('空 bundle 列表返回空工具', async () => {
    const out = await materializeSkillTools([])
    expect(out).toEqual([])
  })

  it('脚本工具声明 → 物化为可调用工具，spawn 执行返回 stdout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-test-'))
    writeFileSync(
      join(dir, 'echo.mts'),
      'import process from "node:process"\nlet s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{let x="?";try{x=JSON.parse(s).x}catch(e){}process.stdout.write("hi "+x)})\n',
    )
    try {
      const bundle = {
        code: 'test_skill',
        name: 'test',
        description: '',
        frontmatter: {},
        body: '',
        files: {},
        dir,
        tools: [{
          name: 'echo_test',
          description: 'echo args',
          inputSchema: { type: 'object' as const, properties: { x: { type: 'string' } }, required: ['x'] },
          run: 'echo.mts',
        }],
        mcp: [],
      }
      const out = await materializeSkillTools([bundle])
      expect(out).toHaveLength(1)
      expect(out[0]!.name).toBe('echo_test')
      const result = await out[0]!.invoke({ x: 'world' })
      expect(String(result)).toBe('hi world')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('脚本路径越界返回错误字符串，不抛', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-test-'))
    try {
      const bundle = {
        code: 'test_skill',
        name: 'test',
        description: '',
        frontmatter: {},
        body: '',
        files: {},
        dir,
        tools: [{
          name: 'escape_test',
          description: 'escape',
          inputSchema: { type: 'object' as const },
          run: '../escape.mjs',
        }],
        mcp: [],
      }
      const out = await materializeSkillTools([bundle])
      const result = await out[0]!.invoke({})
      expect(String(result)).toContain('越界')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
