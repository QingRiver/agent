/**
 * Vite 没有 webpack runtime。`react-server-dom-webpack/client`（browser）在模块
 * 初始化时会读写 `__webpack_require__.u`，解析 client reference 时还会调用
 * `__webpack_require__` / `__webpack_chunk_load__`。
 *
 * 本轮无 'use client' module map；shim 只满足初始化。若 Flight 里意外出现
 * client module，抛出可读错误而不是 ReferenceError。
 */
type WebpackRequire = ((id: string | number) => unknown) & {
  u: (chunkId: string | number) => string
}

type WebpackGlobals = typeof globalThis & {
  __webpack_require__?: WebpackRequire
  __webpack_chunk_load__?: (chunkId: string | number) => Promise<unknown>
}

export function installRscWebpackShim(): void {
  const g = globalThis as WebpackGlobals

  if (typeof g.__webpack_require__ !== 'function') {
    const requireFn: WebpackRequire = Object.assign(
      (id: string | number) => {
        throw new Error(
          `[rsc] unexpected client module id=${String(id)}; 'use client' is not wired yet`,
        )
      },
      { u: (chunkId: string | number) => String(chunkId) },
    )
    g.__webpack_require__ = requireFn
  }
  else if (typeof g.__webpack_require__.u !== 'function') {
    g.__webpack_require__.u = chunkId => String(chunkId)
  }

  if (typeof g.__webpack_chunk_load__ !== 'function')
    g.__webpack_chunk_load__ = async () => null
}

installRscWebpackShim()
