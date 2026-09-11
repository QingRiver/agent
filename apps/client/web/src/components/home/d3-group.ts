/** 二面体群 D₃：正三角形对称群，|D₃|=6，≅ S₃ ⊂ SO(3)。 */

export const D3_ELEMS = ['e', 'r', 'r2', 's', 'sr', 'sr2'] as const
export type D3Elem = (typeof D3_ELEMS)[number]

/** 展示用：r² 等 */
export const D3_LABEL: Record<D3Elem, string> = {
  e: 'e',
  r: 'r',
  r2: 'r²',
  s: 's',
  sr: 'sr',
  sr2: 'sr²',
}

export const D3_DESC: Record<D3Elem, string> = {
  e: '恒等（不动）',
  r: '顺时针旋转 120°',
  r2: '顺时针旋转 240°',
  s: '沿过红点的轴翻转',
  sr: '沿过蓝点的轴翻转',
  sr2: '沿过黄点的轴翻转',
}

/**
 * 凯莱表：行 · 列（行在前）。
 * 与 D₃ = ⟨r,s | r³=e, s²=e, srs=r⁻¹⟩ 一致。
 */
const MUL: Record<D3Elem, Record<D3Elem, D3Elem>> = {
  e: { e: 'e', r: 'r', r2: 'r2', s: 's', sr: 'sr', sr2: 'sr2' },
  r: { e: 'r', r: 'r2', r2: 'e', s: 'sr2', sr: 's', sr2: 'sr' },
  r2: { e: 'r2', r: 'e', r2: 'r', s: 'sr', sr: 'sr2', sr2: 's' },
  s: { e: 's', r: 'sr', r2: 'sr2', s: 'e', sr: 'r', sr2: 'r2' },
  sr: { e: 'sr', r: 'sr2', r2: 's', s: 'r2', sr: 'e', sr2: 'r' },
  sr2: { e: 'sr2', r: 's', r2: 'sr', s: 'r', sr: 'r2', sr2: 'e' },
}

/** a · b（先 b 后 a，左作用） */
export function mul(a: D3Elem, b: D3Elem): D3Elem {
  return MUL[a][b]
}

/** 轴角：用于 CSS rotate3d(x,y,z,deg) */
export interface AxisAngle {
  x: number
  y: number
  z: number
  deg: number
}

/** 行优先 3×3，作用为列向量 v ↦ M v */
export interface Mat3 {
  m00: number
  m01: number
  m02: number
  m10: number
  m11: number
  m12: number
  m20: number
  m21: number
  m22: number
}

export const MAT3_I: Mat3 = {
  m00: 1,
  m01: 0,
  m02: 0,
  m10: 0,
  m11: 1,
  m12: 0,
  m20: 0,
  m21: 0,
  m22: 1,
}

/** P·Q：先 Q 再 P */
export function mulMat3(P: Mat3, Q: Mat3): Mat3 {
  return {
    m00: P.m00 * Q.m00 + P.m01 * Q.m10 + P.m02 * Q.m20,
    m01: P.m00 * Q.m01 + P.m01 * Q.m11 + P.m02 * Q.m21,
    m02: P.m00 * Q.m02 + P.m01 * Q.m12 + P.m02 * Q.m22,
    m10: P.m10 * Q.m00 + P.m11 * Q.m10 + P.m12 * Q.m20,
    m11: P.m10 * Q.m01 + P.m11 * Q.m11 + P.m12 * Q.m21,
    m12: P.m10 * Q.m02 + P.m11 * Q.m12 + P.m12 * Q.m22,
    m20: P.m20 * Q.m00 + P.m21 * Q.m10 + P.m22 * Q.m20,
    m21: P.m20 * Q.m01 + P.m21 * Q.m11 + P.m22 * Q.m21,
    m22: P.m20 * Q.m02 + P.m21 * Q.m12 + P.m22 * Q.m22,
  }
}

/**
 * 顶点轴（单位，屏幕 y 向下，原点=三角形几何中心）：
 * A 上、B 左下、C 右下。
 */
export const AXIS_A = { x: 0, y: -1, z: 0 } as const
export const AXIS_B = { x: -Math.sqrt(3) / 2, y: 0.5, z: 0 } as const
export const AXIS_C = { x: Math.sqrt(3) / 2, y: 0.5, z: 0 } as const
/** 法向：指向观察者；顺时针用负角（或绕 -Z 正角） */
export const AXIS_N = { x: 0, y: 0, z: 1 } as const

/**
 * D₃ → SO(3)：平面旋转 = 绕法向；平面反射 = 绕轴 180°。
 * 屏幕 y 向下时，绕 +Z（朝向观察者）的右手正角在视觉上为顺时针。
 */
export function opAxisAngle(op: D3Elem): AxisAngle {
  switch (op) {
    case 'e':
      return { x: 0, y: 0, z: 1, deg: 0 }
    case 'r':
      return { x: 0, y: 0, z: 1, deg: 120 }
    case 'r2':
      return { x: 0, y: 0, z: 1, deg: 240 }
    case 's':
      return { x: AXIS_A.x, y: AXIS_A.y, z: AXIS_A.z, deg: 180 }
    case 'sr':
      return { x: AXIS_C.x, y: AXIS_C.y, z: AXIS_C.z, deg: 180 }
    case 'sr2':
      return { x: AXIS_B.x, y: AXIS_B.y, z: AXIS_B.z, deg: 180 }
  }
}

/** 单算子 → rotate3d(...) */
export function opRotate3dCss(op: D3Elem): string {
  return axisAngleCss(opAxisAngle(op))
}

export function axisAngleCss(aa: AxisAngle): string {
  const r = (n: number) => Number(n.toFixed(8))
  return `rotate3d(${r(aa.x)}, ${r(aa.y)}, ${r(aa.z)}, ${r(aa.deg)}deg)`
}

/** Rodrigues：轴角 → SO(3) */
export function axisAngleMat3(aa: AxisAngle): Mat3 {
  const n = Math.hypot(aa.x, aa.y, aa.z)
  if (n < 1e-12 || Math.abs(aa.deg) < 1e-12)
    return { ...MAT3_I }
  const x = aa.x / n
  const y = aa.y / n
  const z = aa.z / n
  const t = (aa.deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const C = 1 - c
  return {
    m00: c + x * x * C,
    m01: x * y * C - z * s,
    m02: x * z * C + y * s,
    m10: y * x * C + z * s,
    m11: c + y * y * C,
    m12: y * z * C - x * s,
    m20: z * x * C - y * s,
    m21: z * y * C + x * s,
    m22: c + z * z * C,
  }
}

export function opMat3(op: D3Elem): Mat3 {
  return axisAngleMat3(opAxisAngle(op))
}

/** 插值：固定轴，角度 0→目标（反射即 0→180° 翻转） */
export function lerpOpMat3(op: D3Elem, t: number): Mat3 {
  const u = Math.min(1, Math.max(0, t))
  const aa = opAxisAngle(op)
  return axisAngleMat3({ ...aa, deg: aa.deg * u })
}

export function composeOpsMat3(ops: readonly D3Elem[]): Mat3 {
  let m = MAT3_I
  for (const op of ops)
    m = mulMat3(m, opMat3(op))
  return m
}

/** 合成姿态用单一 matrix3d，保证同态（不靠 CSS 叠 rotate3d 字符串） */
export function mat3Css(m: Mat3): string {
  const r = (x: number) => Number(x.toFixed(8))
  // matrix3d 列优先：列0=(m00,m10,m20,0), …
  return `matrix3d(${[
    r(m.m00),
    r(m.m10),
    r(m.m20),
    0,
    r(m.m01),
    r(m.m11),
    r(m.m21),
    0,
    r(m.m02),
    r(m.m12),
    r(m.m22),
    0,
    0,
    0,
    0,
    1,
  ].join(', ')})`
}

export function composeOpsCss(ops: readonly D3Elem[]): string {
  return mat3Css(composeOpsMat3(ops))
}

/** 算子卡：单步几何 */
export function opDeltaCss(op: D3Elem): string {
  return opRotate3dCss(op)
}
