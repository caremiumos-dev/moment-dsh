/**
 * 插件配置：连哪个 moment 服务端、用哪个账号身份。
 *
 * `chipId` 是唯一鉴权标识（等同密码），所以三项凭据都支持环境变量兜底 ——
 * 可以在 `cordis.yml` 里只写非敏感字段，凭据走 `MOMENT_*` 环境变量。
 */

/** 用户在 `cordis.yml` 里写的原始配置，字段全部可选。 */
export interface MomentConfig {
  /** 服务端根地址，例如 `http://127.0.0.1:8000`。 */
  baseUrl?: string
  /** 账号 watchId。缺省时读 `MOMENT_WATCH_ID`。 */
  watchId?: string
  /** 硬件 chipId，等同密码。缺省时读 `MOMENT_CHIP_ID`。 */
  chipId?: string
  /** 设备号，仅用于服务端统计。缺省时读 `MOMENT_DEVICE_ID`。 */
  deviceId?: string
  /** 单次请求超时（毫秒），默认 15000。 */
  timeoutMs?: number
  /** 一条动态最多能挂几个话题；服务端配置为 2。 */
  maxTopics?: number
}

/** 补齐默认值后的配置。 */
export interface ResolvedMomentConfig {
  baseUrl: string
  watchId: string
  chipId: string
  deviceId: string
  timeoutMs: number
  maxTopics: number
}

/** 缺省值的环境变量名。 */
const ENV_KEYS = {
  baseUrl: 'MOMENT_BASE_URL',
  watchId: 'MOMENT_WATCH_ID',
  chipId: 'MOMENT_CHIP_ID',
  deviceId: 'MOMENT_DEVICE_ID',
} as const

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'
const DEFAULT_DEVICE_ID = 'dsh'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_TOPICS = 2

/** 配置字段优先，其次环境变量。 */
function pick(value: string | undefined, envKey: string): string {
  const trimmed = (value ?? '').trim()
  return trimmed || (process.env[envKey] ?? '').trim()
}

export function resolveConfig(raw?: MomentConfig): ResolvedMomentConfig {
  const timeout = Number(raw?.timeoutMs ?? 0)
  const maxTopics = Number(raw?.maxTopics ?? 0)
  return {
    baseUrl: (pick(raw?.baseUrl, ENV_KEYS.baseUrl) || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    watchId: pick(raw?.watchId, ENV_KEYS.watchId),
    chipId: pick(raw?.chipId, ENV_KEYS.chipId),
    deviceId: pick(raw?.deviceId, ENV_KEYS.deviceId) || DEFAULT_DEVICE_ID,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    maxTopics: Number.isFinite(maxTopics) && maxTopics > 0 ? Math.floor(maxTopics) : DEFAULT_MAX_TOPICS,
  }
}

/**
 * 缺凭据时返回一句可操作的提示，否则返回 `null`。
 *
 * 提前拦下来是为了让模型看到「配置缺什么」，而不是收到一个含糊的鉴权失败。
 */
export function describeMissingCredentials(config: ResolvedMomentConfig): string | null {
  const missing: string[] = []
  if (!config.watchId) missing.push(`watchId（配置 watchId 或环境变量 ${ENV_KEYS.watchId}）`)
  if (!config.chipId) missing.push(`chipId（配置 chipId 或环境变量 ${ENV_KEYS.chipId}）`)
  if (!missing.length) return null
  return `moment 凭据未配置：缺少 ${missing.join('、')}。chipId 是唯一鉴权标识，建议只通过环境变量提供。`
}
