/**
 * dsh-gallery 配置：**所有可调值的唯一来源**。
 * 语义（键名/含义/谁读/优先级）见 INTERFACE.md §2；本文件不解释语义，只给值。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULTS = {
  albumsDir: join(homedir(), '.dsh', 'gallery-packs'),
  albumId: 'inbox',
  enabledAlbums: null, // null = 未设置过 ⇒ 只用当前专辑
  publicBaseUrl: '',
  maxImageBytes: 8 * 1024 * 1024,
  imageExts: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  sendLimitMax: 20,
  displayMaxPx: 240,
  settingsFile: join(homedir(), '.dsh', 'dsh-gallery.json'),
  // 市场（语义见 INTERFACE.md §9）
  proxyUrl: '', // 市场出网代理（空 ⇒ 看 HTTPS_PROXY/HTTP_PROXY 环境变量 ⇒ 都为空则直连）
  remoteDirUrl: null, // null ⇒ 用下面内置源列表
  remoteMaxManifestBytes: 2 * 1024 * 1024,
  remoteMaxArchiveBytes: 100 * 1024 * 1024,
  remoteMaxImageBytes: 8 * 1024 * 1024,
  remoteMaxItems: 500,
  remoteConcurrency: 4,
  previewMax: 60,
  remoteSubs: null,
}

/**
 * 内置目录源，按顺序试第一个能用的（raw 在前：jsDelivr 对 @main 是按仓库缓存的，push 后仍吐旧内容）。
 * 默认指向 dsh-meme-packs 公共图库目录；要换成自己的目录，写 settings.remoteDirUrl 即可。
 */
export const DEFAULT_REMOTE_DIR_URLS = [
  'https://raw.githubusercontent.com/yyh-001/dsh-meme-packs/main/catalog.json',
  'https://cdn.jsdelivr.net/gh/yyh-001/dsh-meme-packs@main/catalog.json',
  'https://raw.githubusercontent.com/yyh-001/dsh-meme/main/docs/remote-packs.json',
  'https://cdn.jsdelivr.net/gh/yyh-001/dsh-meme@main/docs/remote-packs.json',
]

/** dsh home。用 os.homedir() 而非 process.env.HOME（Windows 上常没有 HOME）。测试用 DSH_GALLERY_HOME 覆盖。 */
export function dshHome() {
  return process.env.DSH_GALLERY_HOME || homedir()
}

export function defaultsFor(home = dshHome()) {
  return {
    ...DEFAULTS,
    albumsDir: join(home, '.dsh', 'gallery-packs'),
    settingsFile: join(home, '.dsh', 'dsh-gallery.json'),
  }
}

/** 合并优先级：用户设置 > patch config > DEFAULTS。 */
export function resolveConfig(saved = {}, patch = {}, home = dshHome()) {
  const out = { ...defaultsFor(home), ...(patch || {}) }
  for (const [k, v] of Object.entries(saved || {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp',
}
