/* eslint-disable no-template-curly-in-string -- 断言模板占位符未泄漏 */
import { describe, expect, it } from 'vitest'
import {
  formatPromptExamplesMarkdown,
  PROMPT_FIXTURE_CONTEXT,
  PROMPT_NEGATIVE_FIXTURES,
  PROMPT_POSITIVE_FIXTURES,
} from './__tests__/perspective-prompt-fixtures'
import { LEAF_OP } from './filter'
import { formatFilterMatrixMarkdown, validatePerspectiveInput } from './perspective-input'
import {
  PERSPECTIVE_PROMPT_TEMPLATE,
  renderPerspectivePrompt,
  renderPerspectivePromptWithDefaults,
} from './perspective-prompt'

describe('perspective prompt fixtures', () => {
  for (const fx of PROMPT_POSITIVE_FIXTURES) {
    it(`正例 ${fx.id} 通过校验`, () => {
      const result = validatePerspectiveInput(fx.input, PROMPT_FIXTURE_CONTEXT, { mode: fx.mode })
      expect(result.ok).toBe(true)
    })
  }

  for (const fx of PROMPT_NEGATIVE_FIXTURES) {
    it(`反例 ${fx.id} 产生预期错误码`, () => {
      const result = validatePerspectiveInput(fx.input, PROMPT_FIXTURE_CONTEXT, { mode: fx.mode })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        for (const code of fx.expectedCodes)
          expect(result.errors.some(e => e.code === code)).toBe(true)
      }
    })
  }
})

describe('renderPerspectivePrompt', () => {
  it('注入矩阵与示例', () => {
    const examples = formatPromptExamplesMarkdown()
    const out = renderPerspectivePrompt({
      filter_matrix: formatFilterMatrixMarkdown(),
      examples,
    })
    expect(out).toContain('`dueDate`')
    expect(out).toContain('query-flagged-due-week')
    expect(out).not.toContain('${filter_matrix}')
    expect(out).not.toContain('${examples}')
  })

  it('renderPerspectivePromptWithDefaults 可渲染', () => {
    const out = renderPerspectivePromptWithDefaults(formatPromptExamplesMarkdown())
    expect(out.length).toBeGreaterThan(PERSPECTIVE_PROMPT_TEMPLATE.length / 2)
  })

  it('矩阵包含 flagged 合法运算符', () => {
    const matrix = formatFilterMatrixMarkdown()
    expect(matrix).toContain('`flagged`')
    expect(matrix).toContain(`${LEAF_OP.IS}, ${LEAF_OP.IS_NOT}`)
    expect(matrix).not.toContain(`flagged\` | ${LEAF_OP.WITHIN}`)
  })
})
