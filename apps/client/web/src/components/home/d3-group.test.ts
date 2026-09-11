import type { D3Elem, Mat3 } from './d3-group'
import { describe, expect, it } from 'vitest'
import {
  composeOpsMat3,
  D3_ELEMS,
  lerpOpMat3,
  MAT3_I,
  mul,
  mulMat3,
  opAxisAngle,
  opMat3,
} from './d3-group'

/** 用户给定凯莱表（行 · 列） */
const EXPECTED: Record<D3Elem, D3Elem[]> = {
  e: ['e', 'r', 'r2', 's', 'sr', 'sr2'],
  r: ['r', 'r2', 'e', 'sr2', 's', 'sr'],
  r2: ['r2', 'e', 'r', 'sr', 'sr2', 's'],
  s: ['s', 'sr', 'sr2', 'e', 'r', 'r2'],
  sr: ['sr', 'sr2', 's', 'r2', 'e', 'r'],
  sr2: ['sr2', 's', 'sr', 'r', 'r2', 'e'],
}

function nearMat(a: Mat3, b: Mat3, digits = 9) {
  expect(a.m00).toBeCloseTo(b.m00, digits)
  expect(a.m01).toBeCloseTo(b.m01, digits)
  expect(a.m02).toBeCloseTo(b.m02, digits)
  expect(a.m10).toBeCloseTo(b.m10, digits)
  expect(a.m11).toBeCloseTo(b.m11, digits)
  expect(a.m12).toBeCloseTo(b.m12, digits)
  expect(a.m20).toBeCloseTo(b.m20, digits)
  expect(a.m21).toBeCloseTo(b.m21, digits)
  expect(a.m22).toBeCloseTo(b.m22, digits)
}

function nearI(m: Mat3) {
  nearMat(m, MAT3_I)
}

describe('d3 mul', () => {
  it('matches cayley table', () => {
    for (const row of D3_ELEMS) {
      D3_ELEMS.forEach((col, j) => {
        expect(mul(row, col)).toBe(EXPECTED[row][j])
      })
    }
  })

  it('satisfies presentation relations', () => {
    expect(mul(mul(mul('e', 'r'), 'r'), 'r')).toBe('e')
    expect(mul('s', 's')).toBe('e')
    expect(mul(mul('s', 'r'), 's')).toBe('r2')
  })
})

describe('d3 SO(3) embedding', () => {
  it('opMat3 matches cayley via matrix multiply', () => {
    for (const a of D3_ELEMS) {
      for (const b of D3_ELEMS) {
        nearMat(mulMat3(opMat3(a), opMat3(b)), opMat3(mul(a, b)))
      }
    }
  })

  it('long word to e is identity', () => {
    const ops: D3Elem[] = ['sr', 'sr', 'r', 'r', 'r', 'sr', 's', 'sr2', 'sr', 'r', 'r']
    let g: D3Elem = 'e'
    for (const o of ops)
      g = mul(g, o)
    expect(g).toBe('e')
    nearI(composeOpsMat3(ops))
  })

  it('r then r2 is identity', () => {
    nearI(mulMat3(opMat3('r'), opMat3('r2')))
    nearI(composeOpsMat3(['r', 'r2']))
  })

  it('lerpOpMat3 endpoints are I and opMat3', () => {
    for (const op of D3_ELEMS) {
      nearI(lerpOpMat3(op, 0))
      nearMat(lerpOpMat3(op, 1), opMat3(op))
    }
  })

  it('r is clockwise on screen (top → bottom-right)', () => {
    const m = opMat3('r')
    // (0,-1,0) → (√3/2, 1/2, 0)
    const x = m.m01 * -1
    const y = m.m11 * -1
    const z = m.m21 * -1
    expect(x).toBeCloseTo(Math.sqrt(3) / 2, 9)
    expect(y).toBeCloseTo(0.5, 9)
    expect(z).toBeCloseTo(0, 9)
  })

  it('reflections are 180° rotate3d about vertex axes', () => {
    expect(opAxisAngle('s').deg).toBe(180)
    expect(opAxisAngle('sr').deg).toBe(180)
    expect(opAxisAngle('sr2').deg).toBe(180)
    expect(opAxisAngle('r').deg).toBe(120)
  })

  it('s² = e in SO(3)', () => {
    nearI(mulMat3(opMat3('s'), opMat3('s')))
  })
})
