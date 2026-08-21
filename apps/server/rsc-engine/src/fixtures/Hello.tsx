/** 纯服务端组件 fixture：仅 host 标签，不依赖 client module map */
export default function Hello({ name = 'RSC' }: { name?: string }) {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>
        Hello from
        {' '}
        {name}
      </h1>
      <p style={{ margin: 0, color: '#666' }}>
        Waku renderRsc → gateway 透传 → web Suspense + use()
      </p>
    </div>
  )
}
