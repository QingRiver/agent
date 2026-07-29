export interface ValidationResult {
  /** 是否合法 */
  isValid: boolean
  /** 具体的错误原因代码 */
  errorCode?:
    | 'EMPTY_NAME'
    | 'INVALID_EXTENSION'
    | 'CONTROL_CHARACTERS'
    | 'INVALID_CHARACTERS'
    | 'TRAILING_SPACE_OR_DOT'
    | 'HIDDEN_FILE_DISALLOWED'
    | 'RESERVED_DIRECTORY_SYMBOL'
    | 'WINDOWS_RESERVED_NAME'
    | 'EXCEEDS_MAX_BYTES'
  /** 可直接展示给用户的错误提示信息 */
  message?: string
}

export interface ValidationOptions {
  /** 是否允许隐藏文件（主干以 '.' 开头），默认为 true */
  allowHidden?: boolean
  /** 允许的文件扩展名，默认强制为 '.markdown' (大小写不敏感) */
  extension?: string
}

/**
 * 校验 .markdown 文件的前半部分（主文件名/Stem）是否符合跨平台命名规范
 *
 * @param fullFileName 完整文件名，例如 "my-note.markdown"
 * @param options 校验配置项
 */
export function validateMarkdownFileName(
  fullFileName: string,
  options: ValidationOptions = {},
): ValidationResult {
  const { allowHidden = true, extension = '.markdown' } = options

  if (!fullFileName || fullFileName.trim().length === 0) {
    return {
      isValid: false,
      errorCode: 'EMPTY_NAME',
      message: '文件名不能为空',
    }
  }

  const targetExt = extension.startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`
  if (!fullFileName.toLowerCase().endsWith(targetExt)) {
    return {
      isValid: false,
      errorCode: 'INVALID_EXTENSION',
      message: `文件名必须以 ${targetExt} 结尾`,
    }
  }

  const stem = fullFileName.slice(0, fullFileName.length - targetExt.length)

  if (!stem || stem.trim().length === 0) {
    return {
      isValid: false,
      errorCode: 'EMPTY_NAME',
      message: '文件名主干部分不能为空',
    }
  }

  if (stem === '.' || stem === '..') {
    return {
      isValid: false,
      errorCode: 'RESERVED_DIRECTORY_SYMBOL',
      message: '文件名主干不能为 "." 或 ".."',
    }
  }

  // eslint-disable-next-line no-control-regex -- 故意匹配 ASCII 控制字符
  if (/[\x00-\x1F\x7F]/.test(stem)) {
    return {
      isValid: false,
      errorCode: 'CONTROL_CHARACTERS',
      message: '文件名包含系统控制字符',
    }
  }

  const invalidCharMatch = stem.match(/[<>:"/\\|?*]/)
  if (invalidCharMatch) {
    return {
      isValid: false,
      errorCode: 'INVALID_CHARACTERS',
      message: `文件名包含非法字符: "${invalidCharMatch[0]}"（不能包含 < > : " / \\ | ? *）`,
    }
  }

  if (/[. ]$/.test(stem)) {
    const isEndWithSpace = stem.endsWith(' ')
    return {
      isValid: false,
      errorCode: 'TRAILING_SPACE_OR_DOT',
      message: `文件名主干末尾不能以${isEndWithSpace ? '空格' : '句点 "."'}结尾`,
    }
  }

  if (!allowHidden && stem.startsWith('.')) {
    return {
      isValid: false,
      errorCode: 'HIDDEN_FILE_DISALLOWED',
      message: '不允许主干以 "." 开头作为隐藏文件',
    }
  }

  const reservedBase = stem.split('.')[0]!.toUpperCase()
  const windowsReservedNames = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/
  if (windowsReservedNames.test(reservedBase)) {
    return {
      isValid: false,
      errorCode: 'WINDOWS_RESERVED_NAME',
      message: `"${reservedBase}" 是 Windows 系统保留关键字，不能用作文件名主干`,
    }
  }

  const totalByteLength = new TextEncoder().encode(fullFileName).length
  if (totalByteLength > 255) {
    return {
      isValid: false,
      errorCode: 'EXCEEDS_MAX_BYTES',
      message: `完整文件名总长度超过 255 字节（当前为 ${totalByteLength} 字节）`,
    }
  }

  return { isValid: true }
}

/** KB 文档标题为主干名；按默认 .md 拼成完整文件名再校验 */
export function validateKbDocName(stem: string): ValidationResult {
  return validateMarkdownFileName(`${stem}.md`, { extension: '.md' })
}
