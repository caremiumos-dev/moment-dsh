import { MomentApiError } from '@caremiumos-dev/node-moment-sdk'

import type { MomentClient } from '@caremiumos-dev/node-moment-sdk'

/** 一个文本内容块，与 `@deepseek-ai/dsh-llm` 的 TextBlock 结构一致。 */
export interface TextBlock {
  type: 'text'
  text: string
}

/**
 * 无损 JSON 值。
 *
 * 本地声明一份，是为了不依赖 `@deepseek-ai/dsh-util-values` 这种传递依赖 ——
 * 它在 pnpm 下有多个物理路径，会把类型比较搅成「两个同名但无关的类型」。
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** 所有 moment 工具共用的返回信封。
 *
 * 工具失败不抛异常，而是回一个 `ok: false` 的结构化结果：模型能读到业务码与
 * 服务端原文，比一句笼统的 `Error: ...` 有用得多。
 */
export interface ToolResult {
  ok: boolean
  /** 服务端业务码；本地校验失败时为 `CONFIG` / `CLIENT_ERROR` 等。 */
  code: string
  /** 失败原因，成功时为空串。 */
  desc: string
  /** 接口原始载荷，失败时为 `null`。 */
  data: JsonValue
}

/** 插件运行时持有的客户端；凭据不全时为 `null`。 */
export interface MomentContext {
  client: MomentClient | null
  /** 凭据缺失的说明，配置完整时为 `null`。 */
  problem: string | null
}

/** 输出 schema：模型看到的字段，与 {@link ToolResult} 一一对应。 */
export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', required: true, description: '调用是否成功（服务端 code 为 000001）。' },
    code: { type: 'string', required: true, description: '服务端业务码；000001 表示成功。' },
    desc: { type: 'string', required: true, description: '失败原因，成功时为空串。' },
    data: { type: 'json', required: true, description: '接口返回的载荷，失败时为 null。' },
  },
  additionalProperties: false,
} as const

/**
 * 把返回值投影成模型可见的文本。
 *
 * `value` 声明成 `unknown` 是为了满足 `ToolOutputDefinition.render` 的签名
 * （它按 `JsonValue` 收参），内部再按 {@link ToolResult} 解释。
 */
export function renderResult(_args: unknown, value: unknown): TextBlock[] {
  return [{ type: 'text', text: describeResult(value as ToolResult) }]
}

/** 一行标题 + 格式化后的载荷。 */
export function describeResult(value: ToolResult): string {
  const head = value.ok
    ? `ok · ${value.code}`
    : `failed · ${value.code}${value.desc ? ` · ${value.desc}` : ''}`
  if (value.data === null || value.data === undefined) return head
  return `${head}\n${JSON.stringify(value.data, null, 2)}`
}

/** 统一的输出声明，直接塞给 `defineTool`。 */
export const RESULT_OUTPUT = { schema: RESULT_SCHEMA, render: renderResult }

/**
 * 成功结果。
 *
 * `data` 收 `unknown` 再收窄成 {@link JsonValue}：这些载荷都是普通对象 / 数组 /
 * 标量，必然可无损序列化，但写成 `JsonValue` 会让 interface 类型的视图对象
 * 因为缺少隐式索引签名而无法直接传入。
 */
export function ok(data: unknown, code = '000001'): ToolResult {
  return { ok: true, code, desc: '', data: data as JsonValue }
}

/** 把任意异常折成结构化失败结果。 */
export function failure(error: unknown): ToolResult {
  if (error instanceof MomentApiError) {
    return {
      ok: false,
      code: error.code,
      desc: error.desc || error.message,
      data: error.watchTips ? { watchTips: error.watchTips } : null,
    }
  }
  if (error instanceof Error) {
    const aborted = error.name === 'AbortError'
    return { ok: false, code: aborted ? 'ABORTED' : 'CLIENT_ERROR', desc: error.message, data: null }
  }
  return { ok: false, code: 'CLIENT_ERROR', desc: String(error), data: null }
}

/**
 * 统一执行壳：先校验凭据，再把异常折成失败结果。
 *
 * 这样每个工具的 `execute` 只写「成功路径」，不必重复 try/catch。
 */
export async function run(
  context: MomentContext,
  signal: AbortSignal | undefined,
  body: (client: MomentClient, signal?: AbortSignal) => Promise<ToolResult>,
): Promise<ToolResult> {
  if (!context.client) {
    return { ok: false, code: 'CONFIG', desc: context.problem ?? 'moment 客户端未配置', data: null }
  }
  try {
    return await body(context.client, signal)
  } catch (error) {
    return failure(error)
  }
}