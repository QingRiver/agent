/** Tailwind 标准色阶步进 */
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

export type ScaleStep = (typeof SCALE_STEPS)[number]
export type ColorScheme = 'complementary' | 'analogous'

const LIGHTNESS_MAP: Record<ScaleStep, number> = {
  50: 97,
  100: 94,
  200: 88,
  300: 78,
  400: 65,
  500: 50,
  600: 40,
  700: 32,
  800: 25,
  900: 18,
  950: 10,
}

const SATURATION_MAP: Record<ScaleStep, number> = {
  50: 30,
  100: 40,
  200: 50,
  300: 55,
  400: 60,
  500: 70,
  600: 72,
  700: 65,
  800: 55,
  900: 50,
  950: 45,
}

const REVERSED_STEPS = [...SCALE_STEPS].reverse() as ScaleStep[]

export type ColorScale = Record<ScaleStep, string>

/** shadcn 语义换肤变量（不含 destructive 等静态位） */
export type SemanticVars = Record<string, string>

export function hslToString(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`
}

export function getComplementaryHue(hue: number): number {
  return (hue + 180) % 360
}

export function getAnalogousHue(hue: number): number {
  return (hue + 30) % 360
}

export function getPrimaryHue(surfaceHue: number, scheme: ColorScheme): number {
  switch (scheme) {
    case 'complementary':
      return getComplementaryHue(surfaceHue)
    case 'analogous':
      return getAnalogousHue(surfaceHue)
  }
}

function parseHslLightness(hsl: string): number {
  const m = hsl.match(/([\d.]+)%\s*\)\s*$/)
  return m ? Number(m[1]) : 50
}

/** 在 50/950 中选与底色对比更大的一侧作 foreground */
export function pickForeground(bg: string, light: string, dark: string): string {
  const bgL = parseHslLightness(bg)
  const lightL = parseHslLightness(light)
  const darkL = parseHslLightness(dark)
  return Math.abs(bgL - lightL) >= Math.abs(bgL - darkL) ? light : dark
}

function buildScale(hue: number, isDark: boolean, satScale: number): ColorScale {
  const lightnessSource = isDark ? REVERSED_STEPS : SCALE_STEPS
  const saturationSource = isDark ? REVERSED_STEPS : SCALE_STEPS
  const scale = {} as ColorScale

  for (let i = 0; i < SCALE_STEPS.length; i++) {
    const step = SCALE_STEPS[i]!
    const lStep = lightnessSource[i]!
    const sStep = saturationSource[i]!
    const scaledSat = Math.min(SATURATION_MAP[sStep] * satScale, 100)
    scale[step] = hslToString(hue, scaledSat, LIGHTNESS_MAP[lStep])
  }
  return scale
}

export function generateColorScale(hue: number, saturation = 100, isDark = false): ColorScale {
  return buildScale(hue, isDark, saturation / 100)
}

function scaleToCssVars(prefix: 'surface' | 'primary', scale: ColorScale): SemanticVars {
  const vars: SemanticVars = {}
  for (const step of SCALE_STEPS)
    vars[`--color-${prefix}-${step}`] = scale[step]
  return vars
}

function mapSemantic(surface: ColorScale, primary: ColorScale, isDark: boolean): SemanticVars {
  return {
    '--background': surface[50],
    '--foreground': surface[950],
    /* 亮色：card 贴近 background，避免整块发灰；暗色：略抬一层 */
    '--card': isDark ? surface[100] : surface[50],
    '--card-foreground': surface[950],
    '--popover': isDark ? surface[100] : surface[50],
    '--popover-foreground': surface[950],
    '--primary': primary[500],
    '--primary-foreground': pickForeground(primary[500], primary[50], primary[950]),
    '--secondary': isDark ? surface[200] : surface[100],
    '--secondary-foreground': surface[950],
    '--muted': isDark ? surface[200] : surface[100],
    '--muted-foreground': isDark ? surface[600] : surface[500],
    '--accent': isDark ? surface[200] : surface[100],
    '--accent-foreground': surface[950],
    '--border': isDark ? surface[300] : surface[200],
    '--input': isDark ? surface[300] : surface[200],
    '--ring': primary[500],
  }
}

export interface SkinTheme {
  light: SemanticVars
  dark: SemanticVars
  /** 当前模式预览用色阶（与 mode 无关的正序 light 阶，便于设置页展示） */
  surfacePreview: ColorScale
  primaryPreview: ColorScale
}

/**
 * 由基础色派生 light + dark 两套默认换肤变量（及预览色阶）。
 */
export function generateSkinTheme(
  hue: number,
  scheme: ColorScheme,
  saturation = 100,
): SkinTheme {
  const primaryHue = getPrimaryHue(hue, scheme)
  const satScale = saturation / 100
  /* 界面铬（surface）降饱和，避免亮色模式整页发脏/发暗；primary 保持用户彩度 */
  const surfaceSatLight = Math.min(satScale, 0.35)
  const surfaceSatDark = Math.min(satScale, 0.45)

  const surfaceLight = buildScale(hue, false, surfaceSatLight)
  const primaryLight = buildScale(primaryHue, false, satScale)
  const surfaceDark = buildScale(hue, true, surfaceSatDark)
  const primaryDark = buildScale(primaryHue, true, satScale)

  return {
    light: {
      ...mapSemantic(surfaceLight, primaryLight, false),
      ...scaleToCssVars('surface', surfaceLight),
      ...scaleToCssVars('primary', primaryLight),
    },
    dark: {
      ...mapSemantic(surfaceDark, primaryDark, true),
      ...scaleToCssVars('surface', surfaceDark),
      ...scaleToCssVars('primary', primaryDark),
    },
    surfacePreview: surfaceLight,
    primaryPreview: primaryLight,
  }
}

export function getHueFromPosition(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
): number {
  const angle = Math.atan2(y - centerY, x - centerX)
  let hue = (angle * 180) / Math.PI + 90
  if (hue < 0)
    hue += 360
  return hue % 360
}

export function isInRing(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
): boolean {
  const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
  return dist >= innerRadius && dist <= outerRadius
}

export function varsToCssBlock(selector: string, vars: SemanticVars): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}
