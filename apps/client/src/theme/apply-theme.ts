import type { ColorScheme, SemanticVars } from './color'
import githubDarkCss from 'highlight.js/styles/github-dark.css?url'
import githubCss from 'highlight.js/styles/github.css?url'
import { generateSkinTheme, varsToCssBlock } from './color'

export const USER_THEME_STYLE_ID = 'user-theme'
export const HLJS_THEME_LINK_ID = 'hljs-theme'

export const THEME_LS_MODE = 'theme.mode'
export const THEME_LS_HUE = 'theme.hue'
export const THEME_LS_SATURATION = 'theme.saturation'
export const THEME_LS_SCHEME = 'theme.scheme'

export type ThemeMode = 'light' | 'dark'

export interface ThemeBase {
  hue: number
  saturation: number
  scheme: ColorScheme
}

/** 出厂默认基础色（与设置页初始值一致；有 localStorage 才注入覆盖 CSS） */
export const DEFAULT_THEME_BASE: ThemeBase = {
  hue: 160,
  saturation: 100,
  scheme: 'complementary',
}

export function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

export function writeLs(key: string, value: string | null): void {
  try {
    if (value == null)
      localStorage.removeItem(key)
    else
      localStorage.setItem(key, value)
  }
  catch {
    // ignore
  }
}

export function readThemeMode(): ThemeMode {
  const raw = readLs(THEME_LS_MODE)
  return raw === 'light' ? 'light' : 'dark'
}

export function readThemeBase(): ThemeBase | null {
  const hueRaw = readLs(THEME_LS_HUE)
  if (hueRaw == null)
    return null
  const hue = Number(hueRaw)
  if (!Number.isFinite(hue))
    return null
  const satRaw = readLs(THEME_LS_SATURATION)
  const saturation = satRaw != null && Number.isFinite(Number(satRaw))
    ? Number(satRaw)
    : DEFAULT_THEME_BASE.saturation
  const schemeRaw = readLs(THEME_LS_SCHEME)
  const scheme: ColorScheme = schemeRaw === 'analogous' ? 'analogous' : 'complementary'
  return { hue, saturation, scheme }
}

export function persistThemeMode(mode: ThemeMode): void {
  writeLs(THEME_LS_MODE, mode)
}

export function persistThemeBase(base: ThemeBase): void {
  writeLs(THEME_LS_HUE, String(base.hue))
  writeLs(THEME_LS_SATURATION, String(base.saturation))
  writeLs(THEME_LS_SCHEME, base.scheme)
}

/** 清除自定义基础色，回退出厂 index.css */
export function clearPersistedThemeBase(): void {
  writeLs(THEME_LS_HUE, null)
  writeLs(THEME_LS_SATURATION, null)
  writeLs(THEME_LS_SCHEME, null)
}

export function syncHljsTheme(isDark: boolean): void {
  let link = document.getElementById(HLJS_THEME_LINK_ID) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = HLJS_THEME_LINK_ID
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  link.href = isDark ? githubDarkCss : githubCss
}

export function applyDocumentMode(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  syncHljsTheme(mode === 'dark')
}

export function applyUserThemeStyle(light: SemanticVars, dark: SemanticVars): void {
  let el = document.getElementById(USER_THEME_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = USER_THEME_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = [
    varsToCssBlock(':root', light),
    varsToCssBlock('.dark', dark),
  ].join('\n')
}

export function clearUserThemeStyle(): void {
  document.getElementById(USER_THEME_STYLE_ID)?.remove()
}

/** 有自定义基础色时注入；否则清除覆盖，回退出厂 CSS */
export function syncUserThemeFromBase(base: ThemeBase | null): void {
  if (!base) {
    clearUserThemeStyle()
    return
  }
  const skin = generateSkinTheme(base.hue, base.scheme, base.saturation)
  applyUserThemeStyle(skin.light, skin.dark)
}

export function isDocumentDark(): boolean {
  return document.documentElement.classList.contains('dark')
}
