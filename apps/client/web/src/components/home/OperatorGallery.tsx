import type { D3Elem } from './d3-group'
import { cn } from '@lib/utils'
import { useEffect, useRef, useState } from 'react'
import {
  axisAngleCss,
  axisAngleMat3,
  D3_DESC,
  D3_ELEMS,
  D3_LABEL,
  MAT3_I,
  mat3Css,
  opAxisAngle,
} from './d3-group'
import { TriangleFigure } from './TriangleFigure'

/** 相位切换间隔；应大于过渡时长，避免动画被打断 */
const PHASE_MS = 4800
const TRANSITION_MS = 2800

/**
 * 六个算子卡：循环播放各自的 rotate3d 增量。
 */
export function OperatorGallery({ className }: { className?: string }) {
  const [phaseOn, setPhaseOn] = useState(true)

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhaseOn(v => !v)
    }, PHASE_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className={cn('flex min-h-0 flex-col rounded-lg border border-border bg-card', className)}>
      <div className="shrink-0 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">算子</h2>
        <p className="text-[11px] text-muted-foreground">
          {`D₃ = {e, r, r², s, sr, sr²}`}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3">
        {D3_ELEMS.map(g => (
          <OperatorCard key={g} elem={g} active={phaseOn} />
        ))}
      </div>
    </div>
  )
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function OperatorCard({ elem, active }: { elem: D3Elem, active: boolean }) {
  const [t, setT] = useState(0)
  const tRef = useRef(0)

  useEffect(() => {
    const target = active ? 1 : 0
    const from = tRef.current
    if (Math.abs(from - target) < 1e-6) {
      tRef.current = target
      return
    }

    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const raw = Math.min(1, (now - t0) / TRANSITION_MS)
      const next = from + (target - from) * easeInOut(raw)
      tRef.current = next
      setT(next)
      if (raw < 1) {
        raf = requestAnimationFrame(frame)
      }
      else {
        tRef.current = target
        setT(target)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active])

  const aa = opAxisAngle(elem)
  const transform = t < 1e-6
    ? mat3Css(MAT3_I)
    : Math.abs(t - 1) < 1e-6
      ? axisAngleCss(aa)
      : mat3Css(axisAngleMat3({ ...aa, deg: aa.deg * t }))

  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-border/80 bg-muted/30 p-2">
      <span className="text-xs font-semibold text-foreground">{D3_LABEL[elem]}</span>
      <TriangleFigure transform={transform} size="sm" animate={false} />
      <span className="line-clamp-2 text-center text-[10px] leading-tight text-muted-foreground">
        {D3_DESC[elem]}
      </span>
    </div>
  )
}
