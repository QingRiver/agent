import type { ThemeBase, ThemeMode } from '../theme/apply-theme'
import type { ColorScheme } from '../theme/color'
import { atom, getDefaultStore } from 'jotai'
import {
  applyDocumentMode,
  clearPersistedThemeBase,
  DEFAULT_THEME_BASE,
  persistThemeBase,
  persistThemeMode,
  readThemeBase,
  readThemeMode,
  syncUserThemeFromBase,
} from '../theme/apply-theme'

function initialBase(): ThemeBase {
  return readThemeBase() ?? { ...DEFAULT_THEME_BASE }
}

export class ThemeStore {
  static readonly modeAtom = atom<ThemeMode>(readThemeMode())
  static readonly hueAtom = atom(initialBase().hue)
  static readonly saturationAtom = atom(initialBase().saturation)
  static readonly schemeAtom = atom<ColorScheme>(initialBase().scheme)
  /** 是否已把基础色持久化为用户主题（有 LS hue） */
  static readonly customizedAtom = atom(readThemeBase() != null)

  private static store() {
    return getDefaultStore()
  }

  static getMode(): ThemeMode {
    return this.store().get(this.modeAtom)
  }

  static isDark(): boolean {
    return this.getMode() === 'dark'
  }

  static getBase(): ThemeBase {
    const s = this.store()
    return {
      hue: s.get(this.hueAtom),
      saturation: s.get(this.saturationAtom),
      scheme: s.get(this.schemeAtom),
    }
  }

  static setMode(mode: ThemeMode): void {
    this.store().set(this.modeAtom, mode)
    persistThemeMode(mode)
    applyDocumentMode(mode)
  }

  static toggleMode(): void {
    this.setMode(this.getMode() === 'dark' ? 'light' : 'dark')
  }

  static setHue(hue: number): void {
    this.store().set(this.hueAtom, hue)
    this.commitBase()
  }

  static setSaturation(saturation: number): void {
    this.store().set(this.saturationAtom, saturation)
    this.commitBase()
  }

  static setScheme(scheme: ColorScheme): void {
    this.store().set(this.schemeAtom, scheme)
    this.commitBase()
  }

  /** 恢复出厂基础色（清 LS + 移除 #user-theme，色轮回到默认值） */
  static resetBase(): void {
    const s = this.store()
    s.set(this.hueAtom, DEFAULT_THEME_BASE.hue)
    s.set(this.saturationAtom, DEFAULT_THEME_BASE.saturation)
    s.set(this.schemeAtom, DEFAULT_THEME_BASE.scheme)
    s.set(this.customizedAtom, false)
    clearPersistedThemeBase()
    syncUserThemeFromBase(null)
  }

  /** 持久化基础色并注入 :root/.dark 换肤变量 */
  private static commitBase(): void {
    const base = this.getBase()
    persistThemeBase(base)
    this.store().set(this.customizedAtom, true)
    syncUserThemeFromBase(base)
  }

  /** 启动时：恢复 class + 若有自定义基础色则注入 */
  static bootstrap(): void {
    const mode = readThemeMode()
    this.store().set(this.modeAtom, mode)
    applyDocumentMode(mode)
    const saved = readThemeBase()
    if (saved) {
      this.store().set(this.hueAtom, saved.hue)
      this.store().set(this.saturationAtom, saved.saturation)
      this.store().set(this.schemeAtom, saved.scheme)
      this.store().set(this.customizedAtom, true)
      syncUserThemeFromBase(saved)
    }
  }
}
