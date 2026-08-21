import type { ReactNode } from 'react'
import { fetchRscStream } from '@apis/rsc-api'
import { createFromReadableStream } from '@lib/rsc-client'
import { Suspense, use, useMemo } from 'react'
import { DEMO_DYNAMIC_SOURCE } from './demo-source'

interface RscElements {
  Fixture?: ReactNode
  Dynamic?: ReactNode
}

/** 解码 Flight 流为 element map（thenable，供 use()） */
function loadRscApp(): Promise<RscElements> {
  return fetchRscStream({ source: DEMO_DYNAMIC_SOURCE }).then(body =>
    createFromReadableStream(body) as Promise<RscElements>,
  )
}

function RscPanels({ thenable }: { thenable: Promise<RscElements> }) {
  const elements = use(thenable)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">fixture · Hello</h2>
        {elements.Fixture}
      </section>
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">TSX string · Dynamic</h2>
        {elements.Dynamic}
      </section>
    </div>
  )
}

export function RscDemoPage() {
  // 稳定 thenable，避免每次 render 新 Promise 导致 Suspense 重挂
  const thenable = useMemo(() => loadRscApp(), [])
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-lg font-medium">RSC 演示</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        同一次
        {' '}
        <code className="text-xs">renderRsc</code>
        ：左侧静态 fixture，右侧 POST 的 TSX string 经 esbuild 编译
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">加载 RSC…</p>}>
        <RscPanels thenable={thenable} />
      </Suspense>
      <details className="mt-4 rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">查看 POST 的 source</summary>
        <pre className="mt-2 overflow-x-auto text-xs leading-relaxed">{DEMO_DYNAMIC_SOURCE}</pre>
      </details>
    </div>
  )
}
