import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/dev')({
  component: DevIndexPage,
})

function DevIndexPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="text-2xl font-semibold">开发演示</h1>
        <p className="mt-2 text-sm text-slate-400">
          与主聊天（AG-UI）分离的 LangGraph 演示入口。
        </p>
        <ul className="mt-6 space-y-3">
          <li>
            <Link
              to="/dev/sse"
              className="block rounded-lg border border-slate-700 px-4 py-3 text-slate-200 hover:bg-slate-800"
            >
              <span className="font-medium">LangGraph SSE</span>
              <span className="mt-1 block text-sm text-slate-500">纯 SSE 流式演示（simpleGraph、weather）</span>
            </Link>
          </li>
        </ul>
        <p className="mt-6 text-sm text-slate-500">
          主聊天请返回
          {' '}
          <Link to="/" className="text-emerald-400 hover:underline">首页</Link>
          。
        </p>
      </div>
    </main>
  )
}
