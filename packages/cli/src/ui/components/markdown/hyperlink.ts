import process from 'node:process'
import supportsHyperlinksLib from 'supports-hyperlinks'

// OSC 8 超链接转义：\e]8;;URL\e\\TEXT\e]8;;\e\\
// 用 \x07 (BEL) 作终止符，兼容性比 ST(\x1b\\) 更广
export const OSC8_START = '\x1B]8;;'
export const OSC8_END = '\x07'

// supports-hyperlinks 库未识别但实测支持 OSC8 的终端
// 同时检查 TERM_PROGRAM 与 LC_TERMINAL（后者在 tmux 内保留，前者被覆写为 tmux）
const ADDITIONAL_HYPERLINK_TERMINALS = [
  'ghostty',
  'Hyper',
  'kitty',
  'alacritty',
  'iTerm.app',
  'iTerm2',
]

/**
 * stdout 是否支持 OSC8 超链接。在 supports-hyperlinks 库基础上扩展额外终端检测。
 */
export function supportsHyperlinks(): boolean {
  if (supportsHyperlinksLib.stdout)
    return true

  const env = process.env
  const termProgram = env.TERM_PROGRAM
  if (termProgram && ADDITIONAL_HYPERLINK_TERMINALS.includes(termProgram))
    return true

  const lcTerminal = env.LC_TERMINAL
  if (lcTerminal && ADDITIONAL_HYPERLINK_TERMINALS.includes(lcTerminal))
    return true

  const term = env.TERM
  if (term?.includes('kitty'))
    return true

  return false
}
