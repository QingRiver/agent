/**
 * 演示用动态 TSX（与引擎 fallback 同内容）。
 * 页面 POST 这份字符串，验证「string → esbuild → renderRsc」路径。
 */
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
