import { Text } from 'ink'
import React from 'react'

import { OSC8_END, OSC8_START, supportsHyperlinks } from './hyperlink'

export function MarkdownLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}): React.ReactNode {
  const supported = supportsHyperlinks()
  return (
    <Text color="blue" underline>
      {supported ? `${OSC8_START}${href}${OSC8_END}` : null}
      {children}
      {supported ? `${OSC8_START}${OSC8_END}` : null}
    </Text>
  )
}
