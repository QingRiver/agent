import type { RouterConfig } from './registry'
import { AgentController } from '../controller/agent'
import { DefaultController } from '../controller/default'
import { SampleController } from '../controller/sample'
import { collectRoutesFromControllers } from './registry'

export const routerConfigs: RouterConfig[] = collectRoutesFromControllers([
  AgentController,
  DefaultController,
  SampleController,
])
