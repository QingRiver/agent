import { DefaultController } from '../controller/default'
import type { RouterConfig } from './registry'
import { collectRoutesFromControllers } from './registry'

export const routerConfigs: RouterConfig[] = collectRoutesFromControllers([
  DefaultController,
])
