import type {
  Folder,
  GtdDocument,
  Perspective,
  Project,
  RepeatRule,
  ReviewConfig,
  SortKey,
  Tag,
  Task,
} from '../schema'
import { randomUUID } from 'node:crypto'
import {
  AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  FOLDER_STATUS,
  GROUP_TYPE,
  REPEAT_ANCHOR,
  REPEAT_CYCLE,
  REVIEW_INTERVAL,
} from '../types'

export const NOW = new Date('2026-07-16T12:00:00Z')
export const NOW_ISO = NOW.toISOString()
export const DUE_SOON_MS = 2 * 24 * 60 * 60 * 1000 // 2 天

export function makeReviewConfig(overrides: Partial<ReviewConfig> = {}): ReviewConfig {
  return {
    enabled: true,
    interval: REVIEW_INTERVAL.WEEKLY,
    customDays: null,
    lastReviewDate: null,
    nextReviewDate: NOW_ISO,
    needsReview: false,
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: randomUUID(),
    name: 'task',
    note: null,
    projectId: null,
    parentId: null,
    order: 0,
    status: EXPLICIT_STATUS.ACTIVE,
    groupType: null,
    deferDate: null,
    dueDate: null,
    completedAt: null,
    droppedAt: null,
    flagged: false,
    estimateMinutes: null,
    repeatRuleId: null,
    tagIds: [],
    attachmentIds: [],
    repeatedFromTaskId: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  }
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: randomUUID(),
    name: 'project',
    note: null,
    folderId: null,
    order: 0,
    status: EXPLICIT_STATUS.ACTIVE,
    type: GROUP_TYPE.PARALLEL,
    defaultDeferOffset: null,
    defaultDueOffset: null,
    defaultTagIds: [],
    flagged: false,
    review: makeReviewConfig(),
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  }
}

export function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: randomUUID(),
    name: 'folder',
    parentId: null,
    order: 0,
    status: FOLDER_STATUS.ACTIVE,
    createdAt: NOW_ISO,
    updatedAt: null,
    ...overrides,
  }
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: randomUUID(),
    name: 'tag',
    parentId: null,
    order: 0,
    color: null,
    createdAt: NOW_ISO,
    updatedAt: null,
    ...overrides,
  }
}

export function makeRepeatRule(overrides: Partial<RepeatRule> = {}): RepeatRule {
  return {
    id: randomUUID(),
    cycle: REPEAT_CYCLE.WEEKLY,
    interval: 1,
    anchor: REPEAT_ANCHOR.COMPLETION,
    daysOfWeek: [],
    endDate: null,
    maxOccurrences: null,
    completedOccurrences: 0,
    ...overrides,
  }
}

export function makeSortKey(overrides: Partial<SortKey> = {}): SortKey {
  return { field: 'order', dir: 'asc', ...overrides }
}

export function makePerspective(overrides: Partial<Perspective> = {}): Perspective {
  return {
    id: randomUUID(),
    name: 'perspective',
    icon: null,
    filter: null,
    groupBy: [],
    sortBy: [],
    availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    showCompleted: false,
    showDropped: false,
    flaggedOnly: null,
    createdAt: NOW_ISO,
    updatedAt: null,
    ...overrides,
  }
}

export function makeDoc(overrides: Partial<GtdDocument> = {}): GtdDocument {
  return {
    version: '1.0.0',
    meta: { createdAt: NOW_ISO, updatedAt: NOW_ISO, schemaVersion: '1' },
    folders: [],
    projects: [],
    tags: [],
    tasks: [],
    perspectives: [],
    repeatRules: [],
    attachments: [],
    ...overrides,
  }
}
