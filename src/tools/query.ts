import { defineTool } from '@deepseek-ai/dsh-tools'

import { toCommentView, toMomentView } from '../format.js'
import { ok, RESULT_OUTPUT, run, type MomentContext } from '../result.js'

/** 一页最多取多少条动态（服务端上限）。 */
const MAX_PAGE_SIZE = 200

/**
 * `get_moment` —— 读动态。
 *
 * 给 `momentId` 就取那一条；不给就按时间倒序取一页。服务端没有「按 id 查」的接口，
 * 所以按 id 取是翻页扫描实现的，扫不到会回 `000005`。
 */
export function getMomentTool(context: MomentContext) {
  return defineTool({
    name: 'get_moment',
    description:
      'Read moments from the watch feed. Pass momentId to fetch one specific moment (scans the '
      + 'feed, since the service has no lookup-by-id endpoint); omit it to list the newest moments. '
      + 'Each moment comes back with its text, image URLs, topic names, like count and comments.',

    parameters: {
      momentId: { type: 'string', description: 'Fetch exactly this moment. Omit to list the feed.' },
      size: { type: 'integer', description: `How many moments to list, 1-${MAX_PAGE_SIZE}. Defaults to 10.` },
      end: { type: 'integer', description: 'Only return moments created at or before this epoch-millisecond bound.' },
      watchId: { type: 'string', description: 'Only return moments by this account.' },
      includeComments: { type: 'boolean', description: 'Attach each moment’s comments. Defaults to true.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        const includeComments = args.includeComments ?? true

        if (args.momentId) {
          const moment = await client.findMoment(args.momentId, signal)
          return ok({
            moments: [toMomentView(moment, { includeComments })],
            total: 1,
            matchedBy: 'momentId',
          })
        }

        const size = Math.min(Math.max(args.size ?? 10, 1), MAX_PAGE_SIZE)
        const feed = await client.listMoments({ size, end: args.end, watchId: args.watchId }, signal)
        // 服务端忽略 watchId 过滤，按作者筛选只能在本地做。
        const moments = args.watchId
          ? feed.watchMoments.filter((moment) => moment.watchId === args.watchId)
          : feed.watchMoments
        return ok({
          moments: moments.map((moment) => toMomentView(moment, { includeComments })),
          total: feed.total,
          matchedBy: args.watchId ? 'watchId' : 'feed',
        })
      })
    },
  })
}

/** `list_moment_comments` —— 单条动态的完整评论列表（分页）。 */
export function listMomentCommentsTool(context: MomentContext) {
  return defineTool({
    name: 'list_moment_comments',
    description:
      'List the comments of one moment, newest first. Replies carry the name of the account they '
      + 'answer. Use this when the comments embedded in get_moment are not enough.',

    parameters: {
      momentId: { type: 'string', required: true, description: 'The moment whose comments to read.' },
      pageNum: { type: 'integer', description: 'Page number, starting at 1.' },
      pageSize: { type: 'integer', description: 'Comments per page. Defaults to 20.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        const page = await client.getComments(args.momentId, {
          pageNum: args.pageNum,
          pageSize: args.pageSize,
        }, signal)
        return ok({
          momentId: args.momentId,
          comments: page.comments.map(toCommentView),
          totalCount: page.totalCount,
          pageNum: page.pageNum,
          pageSize: page.pageSize,
        })
      })
    },
  })
}

/** `list_moment_topics` —— 推荐话题与发布限制。 */
export function listMomentTopicsTool(context: MomentContext) {
  return defineTool({
    name: 'list_moment_topics',
    description:
      'List the topics the service recommends, plus the publishing limits (how many topics one '
      + 'moment may carry). Call this before publish_moment when you need real topic names.',

    parameters: {},

    output: RESULT_OUTPUT,

    async execute(_args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        const topics = await client.getTopics(signal)
        return ok({
          maxTopicCount: topics.config.maxTopicCount,
          topics: topics.topicList.map((topic) => ({
            name: topic.topicName,
            color: topic.color ?? null,
            jumpUrl: topic.jumpUrl || null,
            // 1 = 官方话题（可带外链），0 = 普通话题。
            topicType: topic.topicType ?? 0,
          })),
        })
      })
    },
  })
}
