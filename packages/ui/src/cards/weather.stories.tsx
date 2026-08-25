import type { Meta, StoryObj } from '@storybook/react-vite'
import { WeatherCurrentCard } from './weather'

const meta = {
  title: 'weather',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta

type Story = StoryObj

export const Current: Story = {
  name: 'weather_current',
  render: () => (
    <WeatherCurrentCard
      city="上海"
      country="中国"
      temperatureC={26.4}
      condition="局部多云"
      observedAt="今天 15:00"
    />
  ),
}

export const SunnyBeijing: Story = {
  name: 'weather_current · 晴',
  render: () => (
    <WeatherCurrentCard
      city="北京"
      country="中国"
      temperatureC={31}
      condition="晴"
    />
  ),
}

export const RainyTokyo: Story = {
  name: 'weather_current · 雨',
  render: () => (
    <WeatherCurrentCard
      city="Tokyo"
      country="日本"
      temperatureC={18.2}
      condition="中雨"
    />
  ),
}
