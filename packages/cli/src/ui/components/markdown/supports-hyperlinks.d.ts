/**
 * supports-hyperlinks 未附带类型声明，此处补 ambient module 声明。
 * 默认导出 { stdout, stderr } 表示对应流是否支持 OSC8 超链接。
 */
declare module 'supports-hyperlinks' {
  const supports: {
    stdout: boolean
    stderr: boolean
  }
  export default supports
}
