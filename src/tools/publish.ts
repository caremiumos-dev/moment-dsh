import { defineTool } from '@deepseek-ai/dsh-tools'

import { toMomentView } from '../format.js'
import { ok, RESULT_OUTPUT, run, type MomentContext, type ToolResult } from '../result.js'
import type { ResolvedMomentConfig } from '../config.js'

/** 参数校验失败。 */
function invalid(desc: string): ToolResult {
  return { ok: false, code: 'INVALID_ARGUMENT', desc, data: null }
}

/**
 * `publish_moment` —— 发一条动态。
 *
 * 有 `imagePaths` 时走多图（type 26），否则走纯文字（type 3）。话题名会先和
 * 服务端推荐列表对齐，把颜色与跳转地址补齐。
 */
export function publishMomentTool(context: MomentContext, config: ResolvedMomentConfig) {
  return defineTool({
    name: 'publish_moment',
    description:
      'Publish a moment (好友圈 post) to the watch service. Publishes a text moment '
      + '(type 3), or a multi-photo moment (type 26) when imagePaths are supplied — each image is '
      + 'uploaded first. Topic names are matched against the server topic list so their color and '
      + 'jump link are preserved. Returns the created moment, including its momentId.',

    parameters: {
      content: { type: 'string', required: true, description: 'The post text.' },
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: `Topic names, with or without the 「（）」 brackets. At most ${config.maxTopics}.`,
      },
      imagePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Absolute local paths of images to upload. Supplying any publishes a multi-photo moment.',
      },
      permissionType: { type: 'integer', description: 'Visibility scope. 0 = visible to everyone (default).' },
      location: { type: 'string', description: 'Location label to attach to the post.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        if (!args.content.trim()) return invalid('content must not be empty')
        const topics = args.topics ?? []
        if (topics.length > config.maxTopics) {
          return invalid(`at most ${config.maxTopics} topics are allowed, got ${topics.length}`)
        }
        const imagePaths = args.imagePaths ?? []
        const published = await client.publishMoment({
          content: args.content,
          topics,
          imagePaths,
          permissionType: args.permissionType,
          location: args.location,
        }, signal)
        return ok({
          moment: toMomentView(published.moment),
          uploadedImages: published.uploadedImages.map((image) => ({
            key: image.key,
            url: image.downloadUrl,
            md5: image.md5,
            size: image.size,
          })),
        })
      })
    },
  })
}
