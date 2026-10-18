import { defineTool } from '@deepseek-ai/dsh-tools'

import { toCommentView } from '../format.js'
import { ok, RESULT_OUTPUT, run, type MomentContext } from '../result.js'

/** `like_moment_by_id` —— 点赞。 */
export function likeMomentTool(context: MomentContext) {
  return defineTool({
    name: 'like_moment_by_id',
    description:
      'Like a moment by its momentId. Liking twice is idempotent — the service keeps a single '
      + 'like row. Returns who liked what, and the moment author’s watchId.',

    parameters: {
      momentId: { type: 'string', required: true, description: 'The moment to like.' },
      emotionId: { type: 'integer', description: 'Emotion id for the like. Defaults to 0 (no emotion).' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        const like = await client.likeMoment(args.momentId, { emotionId: args.emotionId }, signal)
        return ok({
          momentId: like.momentId,
          momentWatchId: like.momentWatchId,
          watchId: like.watchId,
          watchName: like.watchName,
          emotionId: like.emotionId,
          createdAt: new Date(like.createTime).toISOString(),
        })
      })
    },
  })
}

/** `unlike_moment_by_id` —— 取消点赞。 */
export function unlikeMomentTool(context: MomentContext) {
  return defineTool({
    name: 'unlike_moment_by_id',
    description:
      'Cancel your like on a moment by its momentId. Reports whether a like row was actually '
      + 'removed, so a second call honestly returns removed: false.',

    parameters: {
      momentId: { type: 'string', required: true, description: 'The moment to un-like.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        const removed = await client.unlikeMoment(args.momentId, {}, signal)
        return ok({ momentId: args.momentId, removed })
      })
    },
  })
}

/** `comment_moment_by_id` —— 评论 / 回复。 */
export function commentMomentTool(context: MomentContext) {
  return defineTool({
    name: 'comment_moment_by_id',
    description:
      'Comment on a moment by its momentId. Pass replyToWatchId to answer a specific account: the '
      + 'service links the new comment to that account’s latest comment on the moment, so the watch '
      + 'renders it as a reply rather than a standalone comment. The watch app caps comments at 40 '
      + 'characters, but this tool does not.',

    parameters: {
      momentId: { type: 'string', required: true, description: 'The moment to comment on.' },
      comment: { type: 'string', required: true, description: 'The comment text.' },
      replyToWatchId: { type: 'string', description: 'watchId of the account being replied to.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        if (!args.comment.trim()) {
          return { ok: false, code: 'INVALID_ARGUMENT', desc: 'comment must not be empty', data: null }
        }
        const result = await client.commentMoment(args.momentId, args.comment, {
          replyToWatchId: args.replyToWatchId,
        }, signal)
        return ok({
          momentId: args.momentId,
          // 1 = 普通评论，2 = 回复。
          kind: result.comment.type === 2 ? 'reply' : 'comment',
          comment: toCommentView(result.comment),
        })
      })
    },
  })
}
