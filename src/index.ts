// dsh-moment — 把 moment（好友圈）服务暴露成一组 DSH 工具。
//
// 协议实现全部在 @caremiumos-dev/node-moment-sdk 里；本插件只做三件事：
//   1. 把配置（baseUrl / watchId / chipId）解析成 SDK 客户端；
//   2. 为每个能力注册一个 defineTool；
//   3. 把失败折成结构化结果，让模型读到业务码而不是一句笼统的报错。
//
// ── 需要注意的坑 ────────────────────────────────────────────────────────────
// 1. `@deepseek-ai/dsh-tools` 锁在 next-tag 版本；npm 的 latest 是过期的
//    0.0.1-rc.1，不要手动 `npm i` 覆盖。
// 2. 注册是 effect：`ctx.tools.register()` 返回 disposer 并自动挂到插件 fiber 上，
//    卸载时会自动注销工具。
// 3. 加载顺序靠服务依赖（inject），不靠文件顺序。
// 4. 纯 ESM；`@deepseek-ai/cordis` 只 import type（编译期擦除），运行时 ctx 由宿主传入。
// 5. 对象输出 schema 必须显式声明 `additionalProperties`。

import { MomentClient } from '@caremiumos-dev/node-moment-sdk'

import { describeMissingCredentials, resolveConfig, type MomentConfig, type ResolvedMomentConfig } from './config.js'
import type { MomentContext } from './result.js'
import { commentMomentTool, likeMomentTool, unlikeMomentTool } from './tools/interact.js'
import { publishMomentTool } from './tools/publish.js'
import { getMomentTool, listMomentCommentsTool, listMomentTopicsTool } from './tools/query.js'
import { deleteCommentTool, deleteMomentTool } from './tools/remove.js'

import type { Context } from '@deepseek-ai/cordis'

/** 插件名，出现在 loader 诊断里。 */
export const name = 'dsh-moment'

/** 等宿主的工具注册表就绪后再跑。 */
export const inject = ['tools']

/** 一次性建好客户端，所有工具共用。凭据不全时客户端为 `null`，工具会回 CONFIG 错误。 */
function buildContext(config?: MomentConfig): { context: MomentContext; resolved: ResolvedMomentConfig } {
  const resolved = resolveConfig(config)
  const problem = describeMissingCredentials(resolved)
  const context: MomentContext = {
    problem,
    client: problem
      ? null
      : new MomentClient({
        baseUrl: resolved.baseUrl,
        watchId: resolved.watchId,
        chipId: resolved.chipId,
        deviceId: resolved.deviceId,
        timeoutMs: resolved.timeoutMs,
      }),
  }
  return { context, resolved }
}

export function apply(ctx: Context, config?: MomentConfig): void {
  const { context, resolved } = buildContext(config)

  const tools = [
    publishMomentTool(context, resolved),
    getMomentTool(context),
    listMomentCommentsTool(context),
    listMomentTopicsTool(context),
    likeMomentTool(context),
    unlikeMomentTool(context),
    commentMomentTool(context),
    deleteMomentTool(context),
    deleteCommentTool(context),
  ]

  for (const tool of tools) ctx.tools.register(tool)

  // 自检：确认工具真的进了注册表。不打印 watchId/chipId。
  const listed = tools.filter((tool) => ctx.tools.get(tool.name) !== undefined).length
  console.log(`[dsh-moment] registered ${listed}/${tools.length} tools → ${resolved.baseUrl}`)
  if (context.problem) console.warn(`[dsh-moment] ${context.problem}`)
}
