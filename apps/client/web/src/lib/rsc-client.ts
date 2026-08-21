/**
 * 浏览器端 Flight 解码入口：先装 webpack shim，再加载 react-server-dom-webpack。
 * 切勿直接从 `react-server-dom-webpack/client` 导入（Vite 下会缺 `__webpack_require__`）。
 *
 * ESM 按 import 源序求值依赖：shim 模块顶层会 install，之后才加载 webpack client。
 */
/* eslint-disable perfectionist/sort-imports -- shim must evaluate before webpack client */
import './rsc-webpack-shim'
import { createFromReadableStream } from 'react-server-dom-webpack/client'
/* eslint-enable perfectionist/sort-imports */

export { createFromReadableStream }
