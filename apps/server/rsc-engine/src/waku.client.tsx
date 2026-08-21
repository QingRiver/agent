import { createRoot } from 'react-dom/client'
import { Root, Slot } from 'waku/minimal/client'

createRoot(document.body).render(
  <Root>
    <Slot id="App" />
  </Root>,
)
