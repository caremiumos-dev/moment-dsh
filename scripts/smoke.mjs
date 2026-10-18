/**
 * 工具级冒烟：不走模型，直接调用每个工具定义的 `execute`。
 *
 * 验证的是「工具参数 → SDK → 服务端 → 结构化结果」这条链，以及失败时
 * 是否回 `ok: false` 而不是抛异常。
 *
 * 凭据只从环境变量读，脚本里不留默认账号：
 *
 *   MOMENT_BASE_URL=... MOMENT_WATCH_ID=... MOMENT_CHIP_ID=... node scripts/smoke.mjs
 *
 * 注意：`MOMENT_CHIP_ID` 是唯一鉴权标识（等同密码），别写进任何会被提交的文件。
 */

import { MomentClient } from '@caremiumos-dev/node-moment-sdk'

import { resolveConfig } from '../dist/config.js'
import { commentMomentTool, likeMomentTool, unlikeMomentTool } from '../dist/tools/interact.js'
import { publishMomentTool } from '../dist/tools/publish.js'
import { getMomentTool, listMomentCommentsTool, listMomentTopicsTool } from '../dist/tools/query.js'
import { deleteCommentTool, deleteMomentTool } from '../dist/tools/remove.js'

const env = {
  baseUrl: process.env.MOMENT_BASE_URL,
  watchId: process.env.MOMENT_WATCH_ID,
  chipId: process.env.MOMENT_CHIP_ID,
}

const missing = [
  ['MOMENT_BASE_URL', env.baseUrl],
  ['MOMENT_WATCH_ID', env.watchId],
  ['MOMENT_CHIP_ID', env.chipId],
].filter(([, value]) => !value)

if (missing.length > 0) {
  console.error(`缺少环境变量：${missing.map(([name]) => name).join('、')}`)
  console.error('用法：MOMENT_BASE_URL=... MOMENT_WATCH_ID=... MOMENT_CHIP_ID=... node scripts/smoke.mjs')
  process.exit(1)
}

const resolved = resolveConfig({
  baseUrl: env.baseUrl,
  watchId: env.watchId,
  chipId: env.chipId,
  deviceId: 'plugin-smoke',
})

const context = {
  problem: null,
  client: new MomentClient({
    baseUrl: resolved.baseUrl,
    watchId: resolved.watchId,
    chipId: resolved.chipId,
    deviceId: resolved.deviceId,
  }),
}

/** 工具只用到 exec.signal，这里给一个不会取消的。 */
const exec = { signal: new AbortController().signal }

const tools = {
  publish_moment: publishMomentTool(context, resolved),
  get_moment: getMomentTool(context),
  list_moment_comments: listMomentCommentsTool(context),
  list_moment_topics: listMomentTopicsTool(context),
  like_moment_by_id: likeMomentTool(context),
  unlike_moment_by_id: unlikeMomentTool(context),
  comment_moment_by_id: commentMomentTool(context),
  delete_moment: deleteMomentTool(context),
  delete_comment: deleteCommentTool(context),
}

/** 调一个工具并打印结果。 */
async function call(name, args) {
  const result = await tools[name].execute(args, exec)
  const brief = result.ok ? 'ok' : `FAILED ${result.code}: ${result.desc}`
  console.log(`\n▸ ${name} → ${brief}`)
  console.log(JSON.stringify(result.data, null, 2)?.slice(0, 900) ?? 'null')
  return result
}

let created

try {
  const topics = await call('list_moment_topics', {})
  const topicName = topics.data.topics[0]?.name

  const published = await call('publish_moment', {
    content: 'plugin smoke test',
    topics: [topicName].filter(Boolean),
  })
  created = published.data.moment

  await call('get_moment', { momentId: created.momentId })

  await call('like_moment_by_id', { momentId: created.momentId })

  const commented = await call('comment_moment_by_id', {
    momentId: created.momentId,
    comment: 'plugin smoke comment',
  })

  await call('comment_moment_by_id', {
    momentId: created.momentId,
    comment: 'plugin smoke reply',
    replyToWatchId: commented.data.comment.watchId,
  })

  await call('list_moment_comments', { momentId: created.momentId })

  await call('unlike_moment_by_id', { momentId: created.momentId })

  await call('delete_comment', { commentId: commented.data.comment.commentId })

  await call('get_moment', { size: 3, includeComments: false })

  // 故意打一个不存在的 id，确认失败被折成结构化结果而不是抛异常。
  const missing = await call('get_moment', { momentId: 'no-such-moment-id' })
  if (missing.ok) throw new Error('expected get_moment on a missing id to fail')

  // 参数校验：空正文、超话题数。
  const empty = await call('publish_moment', { content: '   ' })
  if (empty.ok) throw new Error('expected empty content to be rejected')

  const tooMany = await call('publish_moment', { content: 'x', topics: ['a', 'b', 'c'] })
  if (tooMany.ok) throw new Error('expected too many topics to be rejected')

  await call('delete_moment', { momentId: created.momentId })
  created = undefined

  console.log('\n✅ 工具冒烟通过：9 个工具、成功路径与失败路径都符合预期')
} catch (error) {
  console.error('\n❌', error)
  process.exitCode = 1
} finally {
  if (created) {
    try {
      await context.client.deleteMoment(created.momentId)
      console.log(`\n🧹 已清理残留动态 ${created.momentId}`)
    } catch (cleanupError) {
      console.error('清理失败：', cleanupError)
    }
  }
}
