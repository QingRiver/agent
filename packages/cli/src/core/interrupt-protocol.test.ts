import type { InteractionRequest } from '@core/types'
import { describe, expect, it } from 'vitest'
import {
  interactionRequestToInterrupt,
  interactionResponseToInterrupt,
  interruptToInteractionRequest,
  interruptToInteractionResponse,
} from './interrupt-protocol'

describe('cli interrupt-protocol mapping', () => {
  describe('request round-trip', () => {
    const cases: InteractionRequest[] = [
      { type: 'input', message: 'q', placeholder: 'p' },
      { type: 'select', message: 'q', options: [{ label: 'A', value: 'a' }] },
      { type: 'multiSelect', message: 'q', options: [{ label: 'A', value: 'a' }] },
      { type: 'modal', title: 't', body: 'b', actions: ['ok', 'cancel'] },
      { type: 'unlock', message: 'press', key: 'y' },
    ]

    it.each(cases)('cLI request → 中性 → CLI request 等价($type)', (req) => {
      const interrupt = interactionRequestToInterrupt(req, 'id-x')
      expect(interrupt.interruptId).toBe('id-x')
      const back = interruptToInteractionRequest(interrupt)
      expect(back).toEqual(req)
    })
  })

  describe('response round-trip', () => {
    it('cLI 响应 ↔ 中性响应 形状一致(interruptId 透传)', () => {
      const resp = { interruptId: 'id-1', type: 'input', payload: { value: 'hi' } }
      const interrupt = interactionResponseToInterrupt(resp)
      expect(interrupt.interruptId).toBe('id-1')
      const back = interruptToInteractionResponse(interrupt)
      expect(back).toEqual(resp)
    })
  })
})
