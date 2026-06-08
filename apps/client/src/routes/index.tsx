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
          LangGraph 纯 SSE、CopilotKit AG-UI 与人在回路（HITL）演示。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/sse"
            className="inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            SSE 演示
          </Link>
          <Link
            to="/agui"
            className="inline-block rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            AG-UI 演示
          </Link>
        </div>
      </div>
    </main>
  )
}
