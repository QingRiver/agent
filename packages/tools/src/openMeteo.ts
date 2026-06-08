import { sleep } from 'radash'

const OPEN_METEO_TIMEOUT_MS = 10_000

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

/** WMO 天气代码 → 中文简述（open-meteo） */
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

function weatherCodeLabel(code: number): string {
  return WEATHER_CODE_LABEL[code] ?? `天气代码 ${code}`
}

/** radash 无 timeout，用 sleep + Promise.race 实现超时拒绝 */
function withTimeout<T>(promise: Promise<T>, ms = OPEN_METEO_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`Open-Meteo 请求超时（${ms / 1000}s）`)
    }),
  ])
}

async function fetchOpenMeteo<T>(url: string): Promise<T> {
  const response = await withTimeout(fetch(url))
  if (!response.ok)
    throw new Error(`Open-Meteo 请求失败: ${response.status}`)
  return await response.json() as T
}

async function getCoordinates(cityName: string): Promise<GeocodingResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh`
  const data = await fetchOpenMeteo<GeocodingResponse>(url)
  if (!data.results?.length)
    return null
  return data.results[0]!
}

async function getCurrentWeather(
  latitude: number,
  longitude: number,
): Promise<ForecastCurrent> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`
  const data = await fetchOpenMeteo<ForecastResponse>(url)
  if (!data.current)
    throw new Error('天气预报无 current 数据')
  return data.current
}

/** 按城市名查询当前天气，返回供 LLM 使用的文本 */
async function fetchWeatherByCity(cityName: string): Promise<string> {
  const place = await getCoordinates(cityName)
  if (!place)
    return `找不到城市「${cityName}」，请检查名称或尝试英文名。`

  const current = await getCurrentWeather(place.latitude, place.longitude)
  const condition = weatherCodeLabel(current.weather_code)

  return [
    `${place.country} ${place.name} 当前天气：`,
    `- 气温：${current.temperature_2m}°C`,
    `- 状况：${condition}`,
  ].join('\n')
}

export const openMeteo = {
  fetchWeatherByCity,
  getCoordinates,
  getCurrentWeather,
}
