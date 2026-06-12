import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { checkpointDbPath } from './sqlite'

const checkpointer = SqliteSaver.fromConnString(checkpointDbPath())

export function getCheckpointer(): SqliteSaver {
  return checkpointer
}
