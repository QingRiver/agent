/** 值为空：null/undefined，或空数组（tag 无标签 / project 无值） */
export function isEmptyValueArrayOrScalar(v: unknown): boolean {
  return v == null || (Array.isArray(v) && v.length === 0)
}
