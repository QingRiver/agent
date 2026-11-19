import type { WriterChangeSummary } from '@agent/proto'
import type { ReactNode } from 'react'
import { hunkKey } from '@agent/proto'
import { createContext, createElement, use } from 'react'

export interface DocumentEditActions {
  accept: (sid: string) => void
  reject: (sid: string) => void
  acceptAll: () => void
  rejectAll: () => void
  /** 当前仍挂在正文预览中的 suggestion sid；用于卡上显示已处理状态 */
  pendingSids: ReadonlySet<string>
}

const DocumentEditActionsContext = createContext<DocumentEditActions | null>(null)

export function DocumentEditActionsProvider({
  value,
  children,
}: {
  value: DocumentEditActions
  children: ReactNode
}) {
  return createElement(DocumentEditActionsContext, { value }, children)
}

export function useDocumentEditActions(): DocumentEditActions | null {
  return use(DocumentEditActionsContext)
}

export function changeSid(change: Pick<WriterChangeSummary, 'hintFrom' | 'originalText'>): string {
  return hunkKey(change.hintFrom, change.originalText)
}
