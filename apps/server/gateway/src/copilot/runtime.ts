import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { copilotAgents } from '../agent'
import { CheckpointConnectRunner } from './checkpointConnectRunner'

export const copilotRuntime = new CopilotRuntime({
  runner: new CheckpointConnectRunner(),
  agents: copilotAgents as never,
})
