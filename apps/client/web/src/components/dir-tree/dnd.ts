import type { DragEvent } from 'react'

/** 统一 dirs 树 DnD：KB / Project 共用读写 helper，MIME 各自区分 */
export function writeTreeDragPayload(e: DragEvent, mime: string, payload: unknown): void {
  const raw = JSON.stringify(payload)
  e.dataTransfer.setData(mime, raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'move'
}

export function readTreeDragPayload<T>(
  e: DragEvent,
  mime: string,
  parse: (raw: string) => T | null,
): T | null {
  const raw = e.dataTransfer.getData(mime) || e.dataTransfer.getData('text/plain')
  return raw ? parse(raw) : null
}

export function allowMoveDrop(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
}
