import type { D3Elem } from './d3-group'
import katex from 'katex'
import { useEffect, useRef, useState } from 'react'
import { CayleyTable } from './CayleyTable'
import { CompositeLab } from './CompositeLab'
import { OperatorGallery } from './OperatorGallery'

/**
 * 首页：D₃ 可视化。
 * 左 ~2/3 连续复合；右上凯莱表；右下算子循环动画。
 * 记号与乘法以 ⟨r,s | r³=e, s²=e, srs=r⁻¹⟩ 为准（不以参考 HTML 为准）。
 */
export function DihedralHome() {
  const [highlight, setHighlight] = useState<D3Elem>('e')
  const formulaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = formulaRef.current
    if (!el)
      return
    katex.render(
      'D_3=\\langle r,s\\mid r^3=e,\\ s^2=e,\\ srs=r^{-1}\\rangle',
      el,
      { throwOnError: false, displayMode: false },
    )
  }, [])

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] w-full flex-col gap-3 px-4 py-4">
      <header className="shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          二面体群 D₃
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          正三角形的几何对称群 · |D₃|=6 · 非阿贝尔 · ≅ S₃
        </p>
        <div ref={formulaRef} className="mt-1 overflow-x-auto text-sm text-foreground/90" />
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
        <div className="min-h-0 lg:col-span-2">
          <CompositeLab className="h-full" onPoseChange={setHighlight} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <CayleyTable highlight={highlight} className="shrink-0" />
          <OperatorGallery className="min-h-0 flex-1" />
        </div>
      </div>
    </div>
  )
}
