/** 演示用动态 TSX：由 client POST 进来，或引擎在无 source 时作 fallback */
export const DEMO_DYNAMIC_SOURCE = `
export default function FromString() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', background: '#f6f8fa' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>From TSX string</h1>
      <p style={{ margin: 0, color: '#666' }}>
        esbuild → eval（同一 React）→ renderRsc
      </p>
    </div>
  )
}
`.trim()
