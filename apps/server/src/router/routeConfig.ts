import type { RouterConfig } from './registry'
import { DefaultController } from '../controller/default'
import { SampleController } from '../controller/sample'
import { collectRoutesFromControllers } from './registry'

export const routerConfigs: RouterConfig[] = collectRoutesFromControllers([
  DefaultController,
  SampleController,
])
