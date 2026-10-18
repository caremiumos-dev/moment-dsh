import { defineTool } from '@deepseek-ai/dsh-tools'

import { ok, RESULT_OUTPUT, run, type MomentContext } from '../result.js'

/** 服务端成功码；`deleteComment` 的 data 里还套了一层信封。 */
const SUCCESS = '000001'

/** `delete_moment` —— 删除动态。 */
export function deleteMomentTool(context: MomentContext) {
  return defineTool({
    name: 'delete_moment',
    description:
      'Delete a moment by its momentId. Only the author (or an admin) may delete it. Deletion is a '
      + 'soft delete on the service, so the moment disappears from every feed.',

    parameters: {
      momentId: { type: 'string', required: true, description: 'The moment to delete.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        await client.deleteMoment(args.momentId, signal)
        return ok({ momentId: args.momentId, deleted: true })
      })
    },
  })
}

/** `delete_comment` —— 删除评论。 */
export function deleteCommentTool(context: MomentContext) {
  return defineTool({
    name: 'delete_comment',
    description:
      'Delete a comment by its commentId. Allowed for the comment’s author, the moment’s author, '
      + 'and admins. Get commentIds from get_moment or list_moment_comments.',

    parameters: {
      commentId: { type: 'string', required: true, description: 'The comment to delete.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        // 这个接口的 data 里又套了一层 {code,data,desc}，沿用客户端的旧信封。
        const result = await client.deleteComment(args.commentId, signal)
        if (result.code !== SUCCESS) {
          return { ok: false, code: result.code, desc: result.desc, data: null }
        }
        return ok({ commentId: args.commentId, deleted: true })
      })
    },
  })
}
