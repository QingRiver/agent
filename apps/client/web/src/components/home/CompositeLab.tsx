import type { D3Elem, Mat3 } from './d3-group'
import { Button } from '@components/ui/button'
import { cn } from '@lib/utils'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  composeOpsMat3,
  D3_ELEMS,
  D3_LABEL,
  lerpOpMat3,
  MAT3_I,
  mat3Css,
  mul,
  mulMat3,
} from './d3-group'
import { TriangleFigure } from './TriangleFigure'

interface CompositeLabProps {
  className?: string
  onPoseChange?: (pose: D3Elem) => void
}

const STEP_MS = 900

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function reduceOps(ops: readonly D3Elem[]): D3Elem {
  let g: D3Elem = 'e'
  for (const o of ops)
    g = mul(g, o)
  return g
}

/**
 * 连续复合：基姿态 × 当前算子在 SO(3) 内插值，再输出单一 matrix3d。
 */
export function CompositeLab({ className, onPoseChange }: CompositeLabProps) {
  const [committed, setCommitted] = useState<D3Elem[]>([])
  const [queued, setQueued] = useState<D3Elem[]>([])
  const [displayMat, setDisplayMat] = useState<Mat3>(MAT3_I)

  const committedRef = useRef<D3Elem[]>([])
  const queueRef = useRef<D3Elem[]>([])
  const busyRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const pose = reduceOps([...committed, ...queued])
  const chain = [...committed, ...queued]

  const notifyPose = useEffectEvent((next: D3Elem) => {
    onPoseChange?.(next)
  })

  useEffect(() => {
    notifyPose(pose)
  }, [pose])

  useEffect(() => {
    return () => {
      if (rafRef.current != null)
        cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function runQueue() {
    if (busyRef.current)
      return
    const op = queueRef.current[0]
    if (!op)
      return

    busyRef.current = true
    const base = composeOpsMat3(committedRef.current)
    const t0 = performance.now()

    const frame = (now: number) => {
      const raw = Math.min(1, (now - t0) / STEP_MS)
      const t = easeInOut(raw)
      setDisplayMat(mulMat3(base, lerpOpMat3(op, t)))

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(frame)
        return
      }

      const nextCommitted = [...committedRef.current, op]
      committedRef.current = nextCommitted
      queueRef.current = queueRef.current.slice(1)
      setCommitted(nextCommitted)
      setQueued([...queueRef.current])
      setDisplayMat(composeOpsMat3(nextCommitted))
      busyRef.current = false
      rafRef.current = null
      runQueue()
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  function applyOp(op: D3Elem) {
    queueRef.current = [...queueRef.current, op]
    setQueued([...queueRef.current])
    runQueue()
  }

  function reset() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    busyRef.current = false
    committedRef.current = []
    queueRef.current = []
    setCommitted([])
    setQueued([])
    setDisplayMat(MAT3_I)
    onPoseChange?.('e')
  }

  return (
    <div className={cn('flex min-h-0 flex-col rounded-lg border border-border bg-card', className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">连续复合变换</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            每步做该算子的几何动作；等价群元另行约化
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={reset}>
          复位
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:gap-10">
        <div className="w-full max-w-xs rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
          <div className="text-muted-foreground">操作链</div>
          <div className="mt-1 break-all font-semibold text-foreground">
            {chain.length === 0
              ? '(空)'
              : chain.map(h => D3_LABEL[h]).join(' → ')}
          </div>
          <div className="my-2 h-px bg-border" />
          <div className="text-muted-foreground">等价于</div>
          <div className="mt-1 text-lg font-bold text-primary">{D3_LABEL[pose]}</div>
        </div>

        <TriangleFigure transform={mat3Css(displayMat)} size="lg" animate={false} />
      </div>

      <div className="flex shrink-0 flex-wrap justify-center gap-2 border-t border-border px-4 py-3">
        {D3_ELEMS.map(op => (
          <Button
            key={op}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => applyOp(op)}
          >
            {D3_LABEL[op]}
          </Button>
        ))}
      </div>
    </div>
  )
}
