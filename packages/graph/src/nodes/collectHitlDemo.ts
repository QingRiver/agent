import type { DevStateType } from '../state/devState'
import {
  hitlApproval,
  hitlInput,
  hitlMultiSelect,
  hitlSelect,
} from '../tools/hitl/interrupt'
import {
  buildHitlSummary,
  EXTRA_OPTIONS,
  PRIORITY_OPTIONS,
} from './hitlDemoFormat'

export { EXTRA_OPTIONS, PRIORITY_OPTIONS } from './hitlDemoFormat'

/** HITL 审批演示：input → select → multiSelect → approval */
export async function collectHitlDemo(state: DevStateType) {
  const inputResp = await hitlInput({
    message: '请简要描述本次操作目的',
    placeholder: '例如：整理季度报表',
  })

  const selectResp = await hitlSelect({
    message: '请选择优先级',
    options: PRIORITY_OPTIONS,
  })

  const multiResp = await hitlMultiSelect({
    message: '请选择附加选项（可多选）',
    options: EXTRA_OPTIONS,
  })

  const partial = {
    userPurpose: inputResp.value,
    priority: selectResp.value,
    extras: multiResp.values,
  }

  const decision = await hitlApproval({
    message: '请确认是否执行以下操作',
    details: buildHitlSummary({ ...state, ...partial }),
  })

  return { ...partial, approval: decision }
}
