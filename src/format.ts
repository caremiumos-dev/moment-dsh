import { parseMomentBody } from '@caremiumos-dev/node-moment-sdk'

import type { Moment, MomentComment } from '@caremiumos-dev/node-moment-sdk'

/** 一条评论的精简视图。 */
export interface CommentView {
  commentId: string
  watchId: string
  watchName: string
  comment: string
  /** ISO-8601（UTC）。 */
  createdAt: string
  /** 回复的是谁；普通评论为 `null`。 */
  replyTo: string | null
}

/** 一条动态的精简视图：正文已从嵌套 JSON 里拆好，话题只留名字。 */
export interface MomentView {
  momentId: string
  watchId: string
  watchName: string
  /** 3 文字 / 5 单图 / 6 短视频 / 24 视频分享 / 26 多图 / 27 视频+文字 / 28 多图分享。 */
  type: number
  /** 正文文字；图片 / 视频动态里从嵌套 JSON 中取。 */
  text: string
  /** 图片绝对地址。视频动态里这里是封面图。 */
  images: string[]
  /** 视频绝对地址；非视频动态为空数组。 */
  videos: string[]
  /** 视频封面；只有视频动态才有。 */
  cover: string | null
  /** 话题名（不含括号）。 */
  topics: string[]
  /** ISO-8601（UTC）。 */
  createdAt: string
  createTime: number
  likeTotal: number
  /** 当前账号是否已经点过赞。 */
  likedByMe: boolean
  comments: CommentView[]
  commentCount: number
}

function toIso(millis: number): string {
  return new Date(millis).toISOString()
}

export function toCommentView(comment: MomentComment): CommentView {
  const isReply = comment.type === 2
  return {
    commentId: comment.commentId,
    watchId: comment.watchId,
    watchName: comment.watchName,
    comment: comment.comment,
    createdAt: toIso(comment.createTime),
    replyTo: isReply ? comment.replyName || comment.replyWatchId || null : null,
  }
}

export function toMomentView(moment: Moment, options: { includeComments?: boolean } = {}): MomentView {
  const body = parseMomentBody(moment.content, moment.type)
  const comments = options.includeComments === false ? [] : (moment.comments ?? []).map(toCommentView)
  return {
    momentId: moment.momentId,
    watchId: moment.watchId,
    watchName: moment.watchName,
    type: moment.type,
    text: body.text,
    images: body.images,
    videos: body.videos,
    cover: body.cover ?? null,
    topics: (moment.topicList ?? []).map((topic) => topic.topicName),
    createdAt: toIso(moment.createTime),
    createTime: moment.createTime,
    likeTotal: moment.likeTotal ?? 0,
    // 服务端的 enableLike 是「还能点赞」，false 即已点过。
    likedByMe: moment.enableLike === false,
    comments,
    commentCount: moment.commentsTotalCount ?? comments.length,
  }
}
