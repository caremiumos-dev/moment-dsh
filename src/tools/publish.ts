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
 * 三种走法：有 `videoPath` 时发视频（无文字 6 / 有文字 27），有 `imagePaths` 时发
 * 多图（type 26），都没有则发纯文字（type 3）。话题名会先和服务端推荐列表对齐，
 * 把颜色与跳转地址补齐。
 */
export function publishMomentTool(context: MomentContext, config: ResolvedMomentConfig) {
  return defineTool({
    name: 'publish_moment',
    description:
      'Publish a moment (好友圈 post) to the watch service. Publishes a text moment (type 3), a '
      + 'multi-photo moment (type 26) when imagePaths are supplied, or a video moment when videoPath '
      + 'is supplied (type 6 without text, type 27 with text) — media is uploaded first. Topic names '
      + 'are matched against the server topic list so their color and jump link are preserved. '
      + 'Returns the created moment, including its momentId.',

    parameters: {
      content: { type: 'string', required: true, description: 'The post text. May be empty for a video-only moment.' },
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
      videoPath: {
        type: 'string',
        description:
          'Absolute local path of a video to upload. Publishes a video moment; mutually exclusive with '
          + 'imagePaths. Empty content gives type 6, non-empty gives type 27.',
      },
      coverPath: {
        type: 'string',
        description:
          'Absolute local path of the video thumbnail (jpg / png / webp). Only meaningful with videoPath. '
          + 'Strongly recommended — clients paint the cover before fetching the video, so a missing cover '
          + 'shows up as a black block.',
      },
      permissionType: { type: 'integer', description: 'Visibility scope. 0 = visible to everyone (default).' },
      location: { type: 'string', description: 'Location label to attach to the post.' },
    },

    output: RESULT_OUTPUT,

    async execute(args, exec) {
      return run(context, exec.signal, async (client, signal) => {
        const videoPath = args.videoPath?.trim() || undefined
        const imagePaths = args.imagePaths ?? []

        // 视频动态允许空正文（那就是 type 6）；其他类型正文必填。
        if (!args.content.trim() && !videoPath) return invalid('content must not be empty')
        if (videoPath && imagePaths.length > 0) {
          return invalid('videoPath and imagePaths are mutually exclusive — use coverPath for the thumbnail')
        }

        const topics = args.topics ?? []
        if (topics.length > config.maxTopics) {
          return invalid(`at most ${config.maxTopics} topics are allowed, got ${topics.length}`)
        }

        const published = await client.publishMoment({
          content: args.content,
          topics,
          imagePaths,
          videoPath,
          coverPath: args.coverPath?.trim() || undefined,
          permissionType: args.permissionType,
          location: args.location,
        }, signal)

        const uploadedVideo = published.uploadedVideo
        return ok({
          moment: toMomentView(published.moment),
          uploadedImages: published.uploadedImages.map((image) => ({
            key: image.key,
            url: image.downloadUrl,
            md5: image.md5,
            size: image.size,
          })),
          uploadedVideo: uploadedVideo
            ? {
                key: uploadedVideo.key,
                url: uploadedVideo.downloadUrl,
                size: uploadedVideo.size,
                cover: uploadedVideo.cover
                  ? { key: uploadedVideo.cover.key, url: uploadedVideo.cover.downloadUrl }
                  : null,
              }
            : null,
        })
      })
    },
  })
}
