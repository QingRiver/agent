/**
 * 透视 View Options（本地覆盖，不写回透视定义）。
 *
 * 按 selection.perspectiveId 存一份可用性设置；项目/标签 focus 的 perspectiveId
 * 已是 projects/tags，与对应透视共用。所有透视（含用户保存的）均可调 View Options。
 *
 * completed + remaining → 空集是正交组合的正确结果；要看完成项需切到 `all`。
 */
import type { AvailabilityFilter, EntityFocus } from '@agent/gtd'
import {
  BUILTIN_PERSPECTIVE_ID,
  DEFAULT_AVAILABILITY_FILTER,
  FILTER_FIELD,
  isAvailabilityFilter,
} from '@agent/gtd'

export interface PerspectiveViewOptions {
  availabilityFilter: AvailabilityFilter
}

/** 当前选中：base 透视 id + 可选实体焦点（禁止 project:/tag: 前缀） */
export interface GtdSelection {
  perspectiveId: string
  focus: EntityFocus | null
}

export const DEFAULT_GTD_SELECTION: GtdSelection = {
  perspectiveId: BUILTIN_PERSPECTIVE_ID.FORECAST,
  focus: null,
}

export function selectPerspective(perspectiveId: string): GtdSelection {
  return { perspectiveId, focus: null }
}

export function selectProjectFocus(projectId: string): GtdSelection {
  return {
    perspectiveId: BUILTIN_PERSPECTIVE_ID.PROJECTS,
    focus: { field: FILTER_FIELD.PROJECT, id: projectId },
  }
}

export function selectTagFocus(tagId: string): GtdSelection {
  return {
    perspectiveId: BUILTIN_PERSPECTIVE_ID.TAGS,
    focus: { field: FILTER_FIELD.TAG, id: tagId },
  }
}

/** View Options 存储键：即 perspectiveId（自定义 uuid / 内置裸 id 一视同仁） */
export function viewOptionsScope(selection: GtdSelection): string {
  return selection.perspectiveId
}

/** 读 overlay 或默认 REMAINING */
export function resolveAvailabilityFilter(
  _scope: string,
  overlay: Partial<PerspectiveViewOptions> | undefined,
): AvailabilityFilter {
  return overlay?.availabilityFilter ?? DEFAULT_AVAILABILITY_FILTER
}

export function patchForAvailability(
  filter: AvailabilityFilter,
): PerspectiveViewOptions {
  return { availabilityFilter: filter }
}

export function parseViewOptionsMap(raw: string): Record<string, Partial<PerspectiveViewOptions>> {
  const parsed = JSON.parse(raw) as unknown
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
    return {}
  const out: Record<string, Partial<PerspectiveViewOptions>> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key || value == null || typeof value !== 'object' || Array.isArray(value))
      continue
    const v = value as Record<string, unknown>
    if (isAvailabilityFilter(v.availabilityFilter))
      out[key] = { availabilityFilter: v.availabilityFilter }
  }
  return out
}

/** localStorage：只认 `{ perspectiveId, focus }`；非法则回默认 forecast */
export function parseGtdSelection(raw: string): GtdSelection {
  const parsed = JSON.parse(raw) as unknown
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
    return DEFAULT_GTD_SELECTION
  const o = parsed as Record<string, unknown>
  if (typeof o.perspectiveId !== 'string' || o.perspectiveId.length === 0)
    return DEFAULT_GTD_SELECTION
  if (o.focus == null)
    return { perspectiveId: o.perspectiveId, focus: null }
  if (typeof o.focus !== 'object' || Array.isArray(o.focus))
    return DEFAULT_GTD_SELECTION
  const f = o.focus as Record<string, unknown>
  if (
    (f.field === FILTER_FIELD.PROJECT || f.field === FILTER_FIELD.TAG)
    && typeof f.id === 'string'
    && f.id.length > 0
  ) {
    return { perspectiveId: o.perspectiveId, focus: { field: f.field, id: f.id } }
  }
  return DEFAULT_GTD_SELECTION
}
