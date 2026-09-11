import { cn } from '@lib/utils'

/** viewBox 中心 = 三角形几何中心 */
const TRI_CX = 90
const TRI_CY = 90
/** 中心到顶点距离 */
const R = 65

const AX = TRI_CX
const AY = TRI_CY - R
const BX = TRI_CX - (R * Math.sqrt(3)) / 2
const BY = TRI_CY + R / 2
const CX = TRI_CX + (R * Math.sqrt(3)) / 2
const CY = TRI_CY + R / 2

interface TriangleFigureProps {
  className?: string
  /** CSS transform（rotate3d / matrix3d），原点为几何中心 */
  transform: string
  /** 是否启用过渡动画 */
  animate?: boolean
  /** 过渡时长（ms） */
  durationMs?: number
  /** 尺寸：主控 / 小卡 */
  size?: 'lg' | 'sm'
}

/**
 * 正三角形：三色圆 + 边。
 * 变换在 SO(3) 中绕几何中心；轻微透视以便看见 180° 翻面。
 */
export function TriangleFigure({
  className,
  transform,
  animate = true,
  durationMs = 1100,
  size = 'sm',
}: TriangleFigureProps) {
  const dim = size === 'lg' ? 200 : 96
  const transition = animate
    ? `transform ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`
    : 'none'

  return (
    <div
      className={cn('relative', className)}
      style={{
        width: dim,
        height: dim,
        perspective: size === 'lg' ? 800 : 480,
        perspectiveOrigin: '50% 50%',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform,
          transformOrigin: '50% 50%',
          transition,
        }}
      >
        <svg viewBox="0 0 180 180" className="size-full overflow-visible" aria-hidden>
          <line x1={AX} y1={AY} x2={BX} y2={BY} stroke="currentColor" className="text-fuchsia-500" strokeWidth="5" strokeLinecap="round" />
          <line x1={BX} y1={BY} x2={CX} y2={CY} stroke="currentColor" className="text-amber-400" strokeWidth="5" strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={AX} y2={AY} stroke="currentColor" className="text-cyan-400" strokeWidth="5" strokeLinecap="round" />
          <circle cx={AX} cy={AY} r="28" fill="#ef4444" opacity="0.9" />
          <circle cx={BX} cy={BY} r="28" fill="#eab308" opacity="0.9" />
          <circle cx={CX} cy={CY} r="28" fill="#3b82f6" opacity="0.9" />
        </svg>
      </div>
    </div>
  )
}
