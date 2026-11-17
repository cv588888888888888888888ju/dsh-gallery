# dsh-gallery

DeepSeek Harness 的**通用图片收藏 / 发图**插件：本地文件、网图 URL、对话里的图都能一键收进收藏夹；之后按关键词或分类找出来，直接发在对话里。

本插件是 [`yyh-001/dsh-meme`](https://github.com/yyh-001/dsh-meme)（表情包插件，MIT，Copyright © 2026 Selfloom contributors）的通用化改造，不是从零写的；沿用与改动逐条列在文末的「来源与许可」。

## 装

环境：DSH 0.2.x（本插件在 0.2.2-rc.3 上开发验证）+ Node ≥ 22.13（存储层用 `node:sqlite`）。
走官方插件装载路径（装进哪个 profile 就写哪个）：

```bash
# 从 GitHub 装：建议锁 commit，避免后续 push 悄悄改变运行内容
dsh plugin --profile web add github:cv588888888888888888888ju/dsh-gallery#<commit>

# 本地开发：link: 指向 clone 下来的目录，改源码即生效
dsh plugin --profile web add link:/path/to/dsh-gallery
```

装完 **重启 `dsh web`**：宿主侧的 `index.js` 是 ESM，热加载不会重新求值已缓存的模块
（ESM 模块按 specifier 缓存，热加载不会重新求值；详见 DSH 插件文档「装载」一节）。卸载：`dsh plugin --profile web remove dsh-gallery`。

## 用

| 你要做的事 | 怎么说 |
|---|---|
| 收藏对话里的图 | 「把这张收进图库」 → 模型调 `save_image`（默认取最近一张用户图片） |
| 收藏本地文件 | 「把 `~/图片/xx.png` 收进图库」 → `save_image file=…` |
| 收藏网图 | 「收藏这个图 https://…」 → `save_image url=…` |
| 让模型找图发出来 | 「发一张猫的图」 → `send_image query=…`，模型把候选的 markdown 写进回复 |
| 自己发收藏的图 | 输入框左侧 🖼 按钮 → 选图 → 直接发出 |
| 从图库市场装别人的图包 | 设置页「图片收藏 → 发现」→ 点卡片「安装」（带 SHA-256 校验与进度条） |

设置页「图片收藏」分三个标签：**专辑**（建/切/开关/上传/编辑/删除/导出）、**发现**（图库市场）、**设置**（扫描目录、目录源、导入 ZIP）。

市场里的包可能是 dsh-meme 的旧布局（`memes/` 目录 + `memes` 表），插件会**在安装时自动转换**成本插件布局（`images/` + `images` 表，并补齐来源/哈希/时间等列）；导入本地 ZIP 走同一条转换路径。默认目录源指向公共图库目录，可在「设置」里换成自己的目录。

## 数据

- 收藏夹（专辑）默认放在 `~/.dsh/gallery-packs/<专辑id>/`：`index.db`（SQLite 索引）+ `manifest.json` + `images/<分类>/<文件>`。删掉这个目录就等于清空收藏。
- 插件设置（当前专辑、开关、扫描目录等）在 `~/.dsh/dsh-gallery.json`。
- 同一张图重复收藏按**内容哈希去重**，不会存两份。

## 配置

所有可调值集中在 [`config.js`](./config.js) 的 `DEFAULTS`，用户设置文件（`~/.dsh/dsh-gallery.json`）可覆盖；键名与语义见 [`INTERFACE.md`](./INTERFACE.md) §2。

**市场出网**（[`INTERFACE.md`](./INTERFACE.md) §9.5）：Node 22 的全局 `fetch` 不认 `HTTPS_PROXY`；直连 GitHub Releases 有时会被限速到 ~4KB/s（装一个包要十几分钟）。所以市场下载支持可选代理：

```json
{ "proxyUrl": "http://127.0.0.1:7897" }
```

不配就走 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量，都没有则直连；代理连不上会自动回落直连重试。`raw.githubusercontent.com` 的地址失败时自动改走 jsDelivr 同名镜像。

## 明确不做（本期）

情绪桶、陪伴斗图提示词注入、QQ 等外部通道、投稿到公共目录（GitHub 表单）、AI 自动打标。

## 验收

```bash
node --test test/*.test.mjs     # 47 项：存储层 / 市场纯逻辑与出网 / 假 ctx 真跑 host 半边（工具 · 路由 · 管理 API · 市场安装与旧格式转换）
```

`test/host.test.mjs` 用假 cordis ctx 直接调 `apply()`，真跑两个工具与两条 HTTP 路由，不依赖活的 DSH 进程。

## 来源与许可

本仓库是 MIT 协议下对 [`yyh-001/dsh-meme`](https://github.com/yyh-001/dsh-meme) 的改造，上游版权归 **Selfloom contributors**。

| | 内容 |
|---|---|
| 沿用上游 | 图库目录 + `node:sqlite` 索引、白名单取图路由 `/dsh-gallery/<album>/<path>`、管理 API、客户端设置面板与输入框选图器、图包导入导出与市场骨架 |
| 本仓库改掉 | 去掉表情包语义（六情绪桶、斗图提示词注入、图库市场/在线目录订阅）；发图改为**原生 markdown 图片**，不需要客户端做 DOM 装饰；新增专辑开关、图包市场 SHA-256 校验、旧 `memes/` 布局自动转换、可选代理出网 |
| 许可 | MIT。`LICENSE` 同时保留上游与本仓库的版权声明；上游原始代码以该仓库为准 |

本仓库与上游作者无关，也未经其背书。

