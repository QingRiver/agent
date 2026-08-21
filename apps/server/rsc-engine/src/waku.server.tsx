import * as React from 'react'
import adapter from 'waku/adapters/default'
import { Slot } from 'waku/minimal/client'
import { unstable_defineHandlers as defineHandlers } from 'waku/minimal/server'
import { CompileError, componentFromSource } from './compile'
import { DEMO_DYNAMIC_SOURCE } from './fixtures/demo-source'
import Hello from './fixtures/Hello'

const handlers = defineHandlers({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'http' && input.pathname === '/render' && input.req.method === 'POST') {
      let body: { source?: string } = {}
      try {
        body = await input.req.json() as { source?: string }
      }
      catch {
        // 无 body / 非 JSON → Dynamic 用 DEMO_DYNAMIC_SOURCE
      }
      try {
        const source = body.source?.trim() ? body.source : DEMO_DYNAMIC_SOURCE
        const Dynamic = await componentFromSource(source, React)
        // Fixture=静态 Hello；Dynamic=TSX string 编译——同流并排
        const stream = await renderRsc({
          Fixture: <Hello />,
          Dynamic: <Dynamic />,
        })
        return new Response(stream, {
          headers: { 'Content-Type': 'text/x-component' },
        })
      }
      catch (err) {
        if (err instanceof CompileError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        throw err
      }
    }

    if (input.type === 'rsc') {
      return renderRsc({ App: <Hello name={input.rscPath || 'RSC'} /> })
    }

    if (input.type === 'http' && input.pathname === '/') {
      const rscPath = ''
      return renderHtml(
        await renderRsc({ App: <Hello /> }),
        <Slot id="App" />,
        { rscPath },
      )
    }

    if (input.type === 'http' && input.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return null
  },

  handleBuild: async ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    generateFile,
  }) => {
    const rscPath = ''
    const stream = await renderRsc({ App: <Hello /> })
    const [rscStream, htmlStream] = stream.tee()
    await generateFile(rscPath2pathname(rscPath), rscStream)
    const html = await renderHtml(htmlStream, <Slot id="App" />, { rscPath })
    if (html.body)
      await generateFile('index.html', html.body)
  },
})

export default adapter(handlers)
