# dsh-moment

DeepSeek Harness 插件：把 moment（好友圈）服务变成一组模型可调用的工具 ——
发动态、读动态、点赞、评论、删除。

协议实现全部在 [`@caremiumos-dev/node-moment-sdk`](https://www.npmjs.com/package/@caremiumos-dev/node-moment-sdk)；
本插件只做配置解析、工具注册，以及把失败折成结构化结果。

## 工具

| 工具 | 说明 |
| --- | --- |
| `publish_moment` | 发动态。传 `imagePaths` 走多图（type 26），否则纯文字（type 3） |
| `get_moment` | 按 `momentId` 取一条，或按时间倒序取一页；带图片地址、话题、点赞数、评论 |
| `list_moment_comments` | 单条动态的完整评论列表（分页） |
| `list_moment_topics` | 推荐话题与发布限制（`maxTopicCount`） |
| `like_moment_by_id` | 点赞（幂等） |
| `unlike_moment_by_id` | 取消点赞，返回是否真的删掉了一条记录 |
| `comment_moment_by_id` | 评论；带 `replyToWatchId` 时成为回复 |
| `delete_moment` | 删除动态（作者或管理员） |
| `delete_comment` | 删除评论（评论作者、动态作者或管理员） |

所有工具返回同一个信封，失败不抛异常：

```json
{ "ok": true, "code": "000001", "desc": "", "data": {} }
```

失败时 `ok: false`，`code` 是服务端业务码（`000005` 资源不存在、`000007` 账号被封禁…），
或本地码（`CONFIG` 凭据缺失、`INVALID_ARGUMENT` 参数非法、`TIMEOUT` 超时）。

## 安装

```sh
dsh plugin --profile <profile> add D:/moment-dsh
```

`dsh plugin add <dir>` 的相对路径锚定**调用目录**，所以要在插件父目录执行。

装完后 CLI 会把 `dsh-moment` 追加进该 profile 的 `dsh.profile.bundles`，
bundle 层的 `cordis.patch.yml` 会把它挂进配置树。

## 配置

按 id 覆盖 bundle 层那一行，**不要**再插一条同 id 的行：

```yaml
- id: dsh-moment
  name: dsh-moment
  config:
    baseUrl: http://127.0.0.1:8000
    watchId: <账号 watchId>
    chipId: <硬件 chipId>
    deviceId: dsh
    maxTopics: 2
    timeoutMs: 15000
```

| 字段 | 默认值 | 环境变量 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:8000` | `MOMENT_BASE_URL` |
| `watchId` | — | `MOMENT_WATCH_ID` |
| `chipId` | — | `MOMENT_CHIP_ID` |
| `deviceId` | `dsh` | `MOMENT_DEVICE_ID` |
| `maxTopics` | `2` | — |
| `timeoutMs` | `15000` | — |

**`chipId` 是唯一鉴权标识（等同密码），泄露即可被盗号。** 建议只走环境变量，不要写进任何仓库：

```sh
export MOMENT_CHIP_ID=...
dsh --profile <profile>
```

凭据缺失时工具不会静默失败，而是回 `code: "CONFIG"` 并说明缺哪一项。

## 开发

```sh
pnpm install
pnpm run build      # tsc → dist/（纯 ESM）

# 工具级冒烟：不走模型，直接调每个工具的 execute
MOMENT_WATCH_ID=... MOMENT_CHIP_ID=... node scripts/smoke.mjs
```

冒烟脚本默认打本地 `http://127.0.0.1:8000`，跑一遍「读 → 发布 → 点赞 → 评论 → 回复 →
取消点赞 → 删评论 → 删动态」，并顺带验证失败路径（找不到的 id、空正文、超话题数）。

## 注意事项

1. `@deepseek-ai/dsh-tools` 锁在 **next**-tag 版本；npm 的 `latest` 是过期的 `0.0.1-rc.1`，
   不要手动 `npm i` 覆盖。
2. 注册是 effect：`ctx.tools.register()` 自动挂到插件 fiber 上，卸载时自动注销。
3. 加载顺序靠服务依赖（`inject = ['tools']`），不靠文件顺序。
4. 纯 ESM；`@deepseek-ai/cordis` 只 `import type`（编译期擦除），运行时 `ctx` 由宿主传入。
5. 对象输出 schema 必须显式声明 `additionalProperties`；`defineTool` 的参数 DSL 用
   `required: true` 标注必填，但那是 **DSL**，不是原始 JSON Schema（`defineTool` 内部会转）。
6. 协议层依赖已发布的 `@caremiumos-dev/node-moment-sdk`（`^0.1.0`）。要改 SDK 就升版重发，
   再在插件里 `pnpm update`；想临时指向本地目录，把依赖换成
   `"@caremiumos-dev/node-moment-sdk": "link:../node-moment-sdk"` 即可（import 路径不用改）。
7. `--dump-config-schema` 里本插件显示 `status: "absent"` 是正常的 —— 那个字段表示
   「有没有导出 `Config` schema」，不代表装载失败。
