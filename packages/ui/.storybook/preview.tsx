import type { Preview } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import './preview.css'

function ThemeDecorator(
  Story: () => ReactNode,
  context: { globals: { theme?: string } },
) {
  const theme = context.globals.theme === 'dark' ? 'dark' : 'light'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = theme
  }, [theme])
  return (
    <div className="sb-card-frame">
      <Story />
    </div>
  )
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: '亮 / 暗',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [ThemeDecorator],
  parameters: {
    layout: 'centered',
    controls: { matchers: { color: /(background|color)$/i } },
  },
}

export default preview
