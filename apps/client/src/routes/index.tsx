import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-4xl items-center justify-center p-6">
      <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Agent Client</h1>
        <p className="mt-3 text-slate-300">
          使用 TanStack Router 访问 LangGraph SSE 或人在回路（HITL）演示页面。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/sse"
            className="inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            LangGraph SSE
          </Link>
          <Link
            to="/weather"
            className="inline-block rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Weather Agent
          </Link>
          <Link
            to="/hitl"
            className="inline-block rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            人在回路
          </Link>
        </div>
      </div>
    </main>
  )
}
