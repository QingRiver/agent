import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { dbConnectionString } from './client'

const checkpointer = PostgresSaver.fromConnString(dbConnectionString())

export function getCheckpointer(): PostgresSaver {
  return checkpointer
}

/** 在 bootstrap 阶段调用，创建 checkpoint/writes 等表 */
export async function setupCheckpointer(): Promise<void> {
  await checkpointer.setup()
}
