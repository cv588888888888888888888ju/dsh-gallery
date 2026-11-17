# dsh-gallery 契约（INTERFACE.md）

> 本文件只写**语义**：键名 · 含义 · 谁读 · 行为。**不写具体数值** —— 所有可调值集中在 `config.js`（唯一来源）。
> 代码/测试/文档的注释只写指针（`# 语义见 INTERFACE.md §X`），不抄语义、不抄数值。

皮肤来源：`yyh-001/dsh-meme`（MIT）。本插件是它的通用化改造：去掉表情包语义（情绪桶 / 斗图提示词 / 图库市场），保留「图库 + 索引 + 取图 + 发送」骨架。

---

## §1 身份

| 项 | 语义 |
|---|---|
| npm 包名 | `dsh-gallery` |
| 插件 id | `dsh-gallery`（loader entry id、client `__ModuleLoader__.load({id})` 必须与包名一致） |
| 与 dsh-meme 的关系 | **不共享数据、不共享设置文件、不共享 HTTP 路由**；两者可同时安装 |

## §2 配置键

值的唯一来源是 `config.js` 的 `DEFAULTS`；用户设置文件覆盖它（键名一一对应）。
读取优先级：用户设置文件 > patch config > `DEFAULTS`。

| 键 | 含义 | 谁读 |
|---|---|---|
| `albumsDir` | 专辑（= 收藏夹）扫描根目录 | host |
| `albumId` | 当前专辑 id | host + client |
| `enabledAlbums` | 模型可发图的专辑 id 列表；未设置过时 = `[当前专辑]` | host |
| `publicBaseUrl` | 生成图片**绝对 URL** 的基址；空则用最近一次请求的 Origin | host |
| `maxImageBytes` | 单张图片字节上限 | host |
| `imageExts` | 允许的图片扩展名 | host |
| `sendLimitMax` | `send_image` 候选数量上限 | host |
| `displayMaxPx` | 对话里本插件图片的最大显示边长（px） | host |
| `settingsFile` | 用户设置文件路径 | host |

**图片 URL 生成规则**（`send_image` 的返回值、面板 API 的返回值都必须遵守）：

1. `publicBaseUrl` 非空 ⇒ 用它；
2. 否则用**最近一次**到达本插件的 HTTP 请求的 Origin（client 半边每次开面板/选图器都会打 `/dsh-gallery-api`，因此真人用过界面后必然被填充）；
3. 都拿不到 ⇒ `http://127.0.0.1:<webServer.port>`。

> 为什么不是直接写 `127.0.0.1`：markdown 图片的 URL 必须是**绝对** http(s)（相对路径在客户端渲染器里不成立），而 `127.0.0.1` 在从别的机器/手机打开 GUI 时会裂图。

## §3 存储布局

```text
<albumsDir>/<albumId>/
  index.db       SQLite，见 §4
  manifest.json  { id, name, description, version, createdAt }（可选，缺省也能当专辑用）
  images/<tag>/<file>
```

- **专辑判定标准**：目录里有 `index.db`（`isAlbumDir`）。专辑 id = 目录名（`[a-z0-9_-]`，小写）。
- 图片相对路径（`rel`）形如 `images/<tag>/<file>`，写进索引的 `path` 字段；取图时按它拼绝对路径，**必须**校验不越出专辑根。
- 内置专辑：`inbox`（收件箱），随插件分发，开箱即用。
- 用户专辑：`<albumsDir>` 下的一层子目录。

## §4 index.db 表 `images`

| 列 | 语义 |
|---|---|
| `path` | 主键，专辑内相对路径（§3） |
| `tag` | 分类（自由文本，非枚举）；落盘前规范化为目录安全名（保留中英文数字与 `-_`，其余折叠成 `_`）；同时决定磁盘子目录 |
| `file_name` | 文件名 |
| `caption` | 一句话描述；`send_image` 优先按它给模型看 |
| `keywords` | 空格分隔检索词 |
| `source` | 来源：`file` / `url` / `attachment` / `import`，附原始路径或 URL |
| `sha256` | 内容哈希，**去重主键**（同一张图重复收藏不产生第二份） |
| `bytes` | 字节数 |
| `mtime` | 文件修改时间 |
| `added_at` | 收藏时间 |
| `used_at` | 最近一次被使用（用户在选图器里点选，或模型用 `pick` 确认） |
| `use_count` | 被使用次数 |

去重语义：`save_image` 先算 `sha256`，命中索引里已有行 ⇒ **不写文件、不插行**，直接返回那一条并把 `source` 追加记录在返回消息里。

## §5 模型侧工具

### §5.1 `save_image`

收藏一张图。三个来源，**按参数二选一**（都不给 = 对话附件）：

| 参数 | 含义 |
|---|---|
| （无来源参数） | 取**本会话最近一张用户图片附件** |
| `attachmentId` | 指定对话附件 id |
| `file` | 本地文件绝对路径（截图/下载目录） |
| `url` | http(s) 图片直链 |

可选元数据参数：`tag`、`caption`、`keywords`、`album`。

行为：定位来源 → 读字节 → 校验类型与大小 → 算 sha256 → 去重 → 落盘 `<当前专辑>/images/<tag>/<随机文件名>` → 插索引。
`tag` 缺省：由 `caption`/`keywords` 推断，再缺省用 `unsorted`。**不调用大模型**（与 dsh-meme 的「自动识图」相反：这里 AI 打标是可选增强，不是必经步骤）。

返回：`{ ok, deduped, rel, url, markdown, tag, caption, message }`。
失败语义：来源不存在 / 非图片 / 超限 / 路径越界 ⇒ `ok:false` + 可读原因，**不写入任何东西**。

### §5.2 `send_image`

给模型候选图，让它把图发进回复。

| 参数 | 含义 |
|---|---|
| `query` | 关键词（caption/keywords/文件名/tag 子串，空格分隔多词，全命中优先） |
| `tag` | 只在某分类里找 |
| `limit` | 候选数量 |
| `pick` | 可选：确认实际发出的那一条 `rel`，用于记账（`used_at` / `use_count`） |

返回：候选数组（每条含 `rel` / `caption` / `tag` / `url` / `markdown`）+ 消息文本。
**发图方式**：模型把候选的 `markdown`（即 `![描述](绝对URL)`）原样写进回复，前端原生渲染 —— 不需要任何客户端装饰。
失败语义：没有可用专辑 / 没命中 ⇒ `ok:false` + 建议换词，**模型不得自行编造 URL**。

## §6 HTTP 接口（host 半边注册）

| 路由 | 方法 | 语义 |
|---|---|---|
| `/dsh-gallery/<albumId>/<rel>` | GET | 取图。白名单 = 该专辑索引里出现过的 `rel`（请求行是百分号编码的，服务端解码后比对索引里的中文路径）；未命中 404。无 albumId 前缀时用**当前专辑** |
| `/dsh-gallery-api` | GET/POST | 管理 API（§7）；每次请求刷新 §2 的 Origin |
| `/dsh-gallery-export` | GET | 导出专辑 ZIP：`?albumId=`；未压缩 ZIP，只打包索引里列到的图 |

## §7 管理 API（`/dsh-gallery-api`）

GET（查询参数）：`albumId`（`all` = 合并全部专辑）、`tag`、`q`。返回专辑列表 + 条目（条目含绝对 URL）。

POST（JSON body，`op` 字段）：

| op | 语义 |
|---|---|
| `list` | 同 GET |
| `upload` | base64 图片 + tag/caption/keywords → 落盘入索引 |
| `update` | 改某条的 tag/caption/keywords |
| `delete` | 删一条（索引 + 文件） |
| `deleteTag` | 删一个分类及其文件 |
| `createAlbum` | 建专辑（校验 id 格式与重名） |
| `setAlbum` | 切换当前专辑 |
| `setAlbumsDir` | 改扫描根目录 |
| `setAlbumEnabled` | 模型可用开关（可多开） |
| `deleteAlbum` | 删专辑（当前专辑先切走；最后一个专辑不许删） |
| `touch` | 记账：某条被使用（`used_at`/`use_count`），选图器点选时调用 |

跨站防护：带 `Origin` 且与 `Host` 不同源 ⇒ 403（本地脚本无 Origin 放行）。

## §9 专辑市场（目录 · 清单 · 安装 · 更新 · 导入导出）

### §9.1 目录源

`remoteDirUrl`（用户设置 > patch config > 内置默认源列表）指向一个 JSON **目录**，两种形状都接受：数组，或 `{ packs: [...] }`。服务端按顺序试各源，第一个能用的为准；进程内 60 秒缓存；请求带时间戳挡中间层缓存。

目录条目字段：`id` / `name` / `description` / `version` / `count` / `preview` / `previews[]` / `keywords[]` / `downloads`（服务端代拉的 GitHub Release 计数，缓存 30 分钟，失败当没有）；拿到包的方式二选一：`archiveUrl`（Release ZIP 直链，强烈建议同时给 `sha256`）或 `manifestUrl`（逐图清单直链，支持增量更新）。

### §9.2 逐图清单

`{ id, name, description, version, memes: [{ url, tag, caption, keywords, file }] }`。服务端并发下载（≤ `remoteConcurrency`）到扫描目录下的 `<id>.tmp-*`，建索引后原子改名；条目级非法只跳过并记 warning，不整体失败。清单超 `remoteMaxManifestBytes`、条目超 `remoteMaxItems`、单图超 `remoteMaxImageBytes` 一律拒绝。

### §9.3 包格式适配（重要）

市场/导入进来的 ZIP 可能是两种布局，**安装时必须统一转换成本插件原生布局**：

| 布局 | 判定 | 处理 |
|---|---|---|
| 原生 | 有 `index.db`，表 `images`，图在 `images/<tag>/` | 直接安装 |
| 旧格式（dsh-meme） | 有 `index.db`，表 `memes`，图在 `memes/<tag>/` | **转换**：表重命名为 `images`，补齐 §4 缺的列（`source`/`sha256`/`bytes`/`added_at`/`used_at`/`use_count`），`path` 前缀 `memes/` → `images/`，目录 `memes/` → `images/` |

转换在临时目录里完成后再原子改名；**不改动任何外部目录**（不去动可能同时被 dsh-meme 使用的目录）。ZIP 内条目路径越界、`manifest.id` 与请求 id 不一致一律拒绝。

### §9.4 市场相关 op

| op | 语义 |
|---|---|
| `remoteDir`（GET 参数）/ `op:'remoteDir'` | 返回目录条目（含 `downloads`） |
| `installRemoteArchive` | 下载 Release ZIP（≤ `remoteMaxArchiveBytes`）→ 校验 `sha256` → 安装 → 切换并打开开关。**任务制**：立即返回 `jobId`，前端轮询 `remoteJobStatus` 画进度条 |
| `subscribeRemote` | 按逐图清单订阅（服务端拉清单 + 并发下载 + 建索引） |
| `previewManifest` | 读清单，返回前 `previewMax` 张图片 URL（不安装） |
| `remoteJobStatus` | 查任务：`state` / `done` / `total` / `added` / `updated` / `failed` / `message` |
| `updateRemotePack` | 按订阅记录更新（archive 复核 SHA-256；manifest 走增量） |
| `importAlbum` | 导入本地 ZIP（应用 §9.3 转换） |
| `exportAlbum` | 返回该专辑的导出地址（`{albumId, url}` 指向 `GET /dsh-gallery-export?albumId=`）；ZIP 本体走那条 GET |
| `setRemoteDirUrl` | 覆盖目录源（`remoteDirUrl`）；空值 ⇒ 恢复内置默认源列表 |

订阅记录与目录源写在用户设置文件里；已下载的包在专辑目录留 `.dsh-remote.json` 侧车（记录来源，供增量更新；不打进导出的 ZIP）。

### §9.5 出网（可选代理 + 镜像重试）

Node 22 的全局 `fetch` **不认** `HTTP_PROXY`/`HTTPS_PROXY` 环境变量，而直连 GitHub Releases 可能被限速到不可用（实测 4KB/s），所以市场出网走自实现的通道：

| 项 | 语义 |
|---|---|
| `proxyUrl` 配置 | 非空 ⇒ 走该 HTTP 代理（`net.js`：http 目标发绝对形式请求；https 目标 CONNECT 打隧道再做 TLS，零第三方依赖） |
| 没配 `proxyUrl` | 依次看 `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy` 环境变量；都为空 ⇒ 直连 |
| 代理不可达 | 判定为「连不上代理」的错误 ⇒ **回落直连重试一次**（不会因为配了代理而整体不通）；超时/证书等其它错误照常上报 |
| 镜像重试 | 地址是 `raw.githubusercontent.com/...`（连接目录/清单/图片）时，失败或非 2xx ⇒ 自动改走 `cdn.jsdelivr.net/gh/...@...` 同名镜像再试一次 |

**为什么必须自己做**：代理是这台机器的真实前提，只用全局 fetch 的话「图库市场」在直连被限速的网络里等于不可用（装一个包要十几分钟）。

## §10 Client 半边

| 挂载点 | 语义 |
|---|---|
| `settings.section` id `gallery`，label「图片收藏」 | 三个一级标签：**专辑**（卡片列表 ⇄ 某专辑图片页：搜索/筛选/上传/编辑/删除/建专辑/切专辑/开关/导出）、**发现**（市场卡片：预览、安装进度条、已装则显示「更新」）、**设置**（扫描目录/目录源/导入 ZIP） |
| `conversation.input.left` + `conversation.input.overlay` | 输入框左侧选图器：点一张 = 把该图的 `markdown` 写进草稿并提交（用户侧发图，模型看到的是文字 URL，界面显示图片） |

## §11 明确出界（本期不做）

情绪桶、陪伴斗图提示词注入、QQ/外部通道、投稿到公共目录（GitHub 表单）、自动识图（AI 打标）。
