import { createFileRoute, redirect } from '@tanstack/react-router'

/** 项目列表已并入资源库；旧 /projects 入口重定向 */
export const Route = createFileRoute('/projects/')({
  beforeLoad: () => {
    throw redirect({ to: '/resources', search: { tab: 'project' } })
  },
})
