import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { getHueFromPosition, hslToString, isInRing } from '../../theme/color'

interface ColorWheelProps {
  hue: number
  onHueChange: (hue: number) => void
  size?: number
}

const RING_WIDTH_RATIO = 0.18

export function ColorWheel({ hue, onHueChange, size = 220 }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)

  const center = size / 2
  const outerRadius = size / 2 - 4
  const innerRadius = outerRadius * (1 - RING_WIDTH_RATIO)

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas)
      return
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, size, size)

    const ring = new Path2D()
    ring.arc(center, center, outerRadius, 0, Math.PI * 2)
    ring.arc(center, center, innerRadius, 0, Math.PI * 2, true)

    const gradient = ctx.createConicGradient(-Math.PI / 2, center, center)
    for (let i = 0; i <= 360; i += 1)
      gradient.addColorStop(i / 360, hslToString(i, 75, 60))

    ctx.fillStyle = gradient
    ctx.fill(ring)

    const midRadius = (outerRadius + innerRadius) / 2
    const angleRad = ((hue - 90) * Math.PI) / 180
    const markerX = center + midRadius * Math.cos(angleRad)
    const markerY = center + midRadius * Math.sin(angleRad)
    const markerRadius = (outerRadius - innerRadius) / 2 - 2

    ctx.beginPath()
    ctx.arc(markerX, markerY, markerRadius + 3, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2)
    ctx.fillStyle = hslToString(hue, 75, 60)
    ctx.fill()
  }, [hue, size, center, outerRadius, innerRadius])

  useEffect(() => {
    drawWheel()
  }, [drawWheel])

  const handlePointerEvent = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas)
        return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      onHueChange(Math.round(getHueFromPosition(x, y, center, center)))
    },
    [center, onHueChange],
  )

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas)
        return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (isInRing(x, y, center, center, innerRadius - 8, outerRadius + 8)) {
        isDraggingRef.current = true
        canvas.setPointerCapture(e.pointerId)
        handlePointerEvent(e)
      }
    },
    [center, innerRadius, outerRadius, handlePointerEvent],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current)
        return
      handlePointerEvent(e)
    },
    [handlePointerEvent],
  )

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="touch-none cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div
          className="h-4 w-4 rounded-full border border-border"
          style={{ backgroundColor: hslToString(hue, 75, 60) }}
        />
        <span>
          色相:
          {Math.round(hue)}
          °
        </span>
      </div>
    </div>
  )
}
