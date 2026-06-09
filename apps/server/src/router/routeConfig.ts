import type { RouterConfig } from './registry'
import { ConversationController } from '../controller/conversation'
import { DefaultController } from '../controller/default'
import { SampleController } from '../controller/sample'
import { collectRoutesFromControllers } from './registry'

export const routerConfigs: RouterConfig[] = collectRoutesFromControllers([
  DefaultController,
  SampleController,
  ConversationController,
])
