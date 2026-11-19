import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { KbStateType } from '../../state/kbState'
import { env } from '@agent/env'
import {
  formatClarifyMarkdown,
  KB_NOT_FOUND_MESSAGE,
  searchKnowledgeBase,
} from '@agent/kb'
import { AIMessage } from '@langchain/core/messages'
import { Command, END } from '@langchain/langgraph'
import { lastHumanMessageText } from '../../utils/messageText'

function getKbId(config: LangGraphRunnableConfig): string {
  const configurable = config.configurable as { kbId?: string } | undefined
  return configurable?.kbId ?? env.KB_COLLECTION
}

export async function kbRetrieveNode(
  state: KbStateType,
  config: LangGraphRunnableConfig,
) {
  const userQuery = lastHumanMessageText(state.messages)
  const outcome = await searchKnowledgeBase(
    getKbId(config),
    userQuery,
    state.rewrittenQueries.length ? { queries: state.rewrittenQueries } : {},
  )

  if (outcome.kind === 'clarify') {
    return new Command({
      update: {
        messages: [new AIMessage(formatClarifyMarkdown(outcome.message))],
      },
      goto: END,
    })
  }

  if (outcome.kind === 'empty') {
    return new Command({
      update: {
        messages: [new AIMessage(KB_NOT_FOUND_MESSAGE)],
        retrievedChunks: [],
      },
      goto: END,
    })
  }

  return new Command({
    update: {
      retrievedChunks: outcome.chunks,
    },
    goto: 'generate',
  })
}

export const KB_RETRIEVE_ENDS = ['generate', END] as const
