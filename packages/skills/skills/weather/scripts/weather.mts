#!/usr/bin/env node
/**
 * get_weather 脚本（自包含 TypeScript，Node 24+ 直接运行，类型剥离无需编译）。
 * stdin 收 JSON { location }；stdout 吐 JSON { ok, weather? | error }。
 * 取 Open-Meteo geocoding + current forecast。无 @agent/tools 依赖，可被其他 agent 直接运行。
 */

import process from 'node:process'

interface WeatherInput {
  location: string
}

interface GeocodingResult {
  name: string
  country: string
  latitude: number
  longitude: number
}

interface GeocodingResponse {
  results?: GeocodingResult[]
}

interface ForecastCurrent {
  temperature_2m: number
  weather_code: number
}

interface ForecastResponse {
  current?: ForecastCurrent
}

interface WeatherResult {
  ok: true
  weather: { city: string, country?: string, temperatureC: number, condition: string }
}

interface WeatherError {
  ok: false
  error: string
}

const TIMEOUT_MS = 10_000

const WEATHER_CODE_LABEL: Record<number, string> = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '小阵雨',
  81: '阵雨',
  82: '大阵雨',
  95: '雷暴',
}

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Open-Meteo 请求超时（${ms / 1000}s）`)), ms),
    ),
  ])
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await withTimeout(fetch(url))
  if (!res.ok)
    throw new Error(`Open-Meteo 请求失败: ${res.status}`)
  return await res.json() as T
}

function writeOut(result: WeatherResult | WeatherError): void {
  process.stdout.write(JSON.stringify(result))
}

async function main(): Promise<void> {
  let input = ''
  for await (const chunk of process.stdin)
    input += chunk
  let location: string | undefined
  try {
    location = (JSON.parse(input || '{}') as WeatherInput).location
  }
  catch {
    writeOut({ ok: false, error: '入参非合法 JSON' })
    return
  }
  if (!location) {
    writeOut({ ok: false, error: '缺少 location' })
    return
  }
  try {
    const geo = await fetchJson<GeocodingResponse>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=zh`)
    const place = geo.results?.[0]
    if (!place) {
      writeOut({ ok: false, error: `找不到城市「${location}」，请检查名称或尝试英文名。` })
      return
    }
    const fc = await fetchJson<ForecastResponse>(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`)
    if (!fc.current) {
      writeOut({ ok: false, error: '天气预报无 current 数据' })
      return
    }
    const condition = WEATHER_CODE_LABEL[fc.current.weather_code] ?? `天气代码 ${fc.current.weather_code}`
    writeOut({
      ok: true,
      weather: {
        city: place.name,
        country: place.country,
        temperatureC: fc.current.temperature_2m,
        condition,
      },
    })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    writeOut({ ok: false, error: `查询「${location}」天气失败：${msg}` })
  }
}

main()
