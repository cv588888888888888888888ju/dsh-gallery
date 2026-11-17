/**
 * dsh-gallery — 通用「收藏图片 / 发送图片」插件（host 半边）。
 * 语义（接口 / 键名 / 行为）见 INTERFACE.md；本文件的注释只写指针。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  Album, albumSlug, ensureAlbum, isAlbumDir, readAlbumMeta, resolveInAlbum, safeTag,
  scanAlbums, searchImages, sha256, writeImage,
} from './store.js'
import {
  convertLegacyEntries, normalizeDirectory, normalizeRemoteManifest, packSlug, unzipStore, zipStore,
} from './market.js'
import { makeFetcher, resolveProxyUrl } from './net.js'
import { DEFAULT_REMOTE_DIR_URLS, MIME, defaultsFor, resolveConfig } from './config.js'

export const name = 'dsh-gallery'
// 语义见 INTERFACE.md §1 / §6
export const inject = ['tools', 'webServer', 'attachments']

const ROUTE = '/dsh-gallery'
const API = '/dsh-gallery-api'
const IMAGE_REL_RE = /^images\//

export function apply(ctx, config) {
  // ---- 设置读写：语义见 INTERFACE.md §2 ----
  const readSettings = () => {
    try { return JSON.parse(readFileSync(defaultsFor().settingsFile, 'utf8')) } catch { return {} }
  }
  const writeSettings = (patch) => {
    try {
      const file = defaultsFor().settingsFile
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({ ...readSettings(), ...patch }, null, 2))
    } catch (error) {
      console.error('[dsh-gallery] 设置写入失败:', error && error.message)
    }
  }
  const cfg = () => resolveConfig(readSettings(), config)
  // 市场出网：可选走本机代理。语义见 INTERFACE.md §9.5
  const netFetch = makeFetcher(() => resolveProxyUrl(cfg().proxyUrl))
  /** raw.githubusercontent.com → jsDelivr 同名镜像（本机 raw 直连被墙，Clash 也可能拒绝该上游）。 */
  const jsdelivrMirror = (url) => {
    const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(String(url || ''))
    return m ? 'https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@' + m[3] + '/' + m[4] : ''
  }
  /** 先按原地址取，失败/非 2xx 再用镜像重试一次。语义见 INTERFACE.md §9.5。 */
  const fetchWithMirror = async (url, init = {}) => {
    let lastError = null
    for (const candidate of [url, jsdelivrMirror(url)]) {
      if (!candidate) continue
      try {
        const res = await netFetch(candidate, init)
        if (res.ok) return res
        lastError = new Error('HTTP ' + res.status)
      } catch (error) { lastError = error }
    }
    throw lastError || new Error('请求失败')
  }

  // ---- 图片绝对 URL：语义见 INTERFACE.md §2 ----
  let lastOrigin = ''
  const webServer = ctx.webServer ?? ctx.get('webServer')
  const fallbackBase = () => {
    const host = webServer && webServer.host === '0.0.0.0' ? '127.0.0.1' : ((webServer && webServer.host) || '127.0.0.1')
    return 'http://' + host + ':' + ((webServer && webServer.port) || 3080)
  }
  const baseUrl = () => String(cfg().publicBaseUrl || lastOrigin || '').replace(/\/+$/, '') || fallbackBase()
  const urlFor = (albumId, rel) => baseUrl() + ROUTE + '/' + albumId + '/' + rel
  const markdownFor = (caption, url) => '![' + String(caption || '').replace(/[\[\]\n\r]/g, ' ').slice(0, 80) + '](' + url + ')'

  // ---- 专辑：当前专辑 + 扫描 ----
  const albumsDirNow = () => resolve(String(cfg().albumsDir))
  const listAlbums = () => {
    const dir = albumsDirNow()
    let albums = scanAlbums(dir)
    if (albums.length === 0) {
      // 一个专辑都没有（新装/换了目录）⇒ 就地建「收件箱」，保证开箱即用
      ensureAlbum(join(dir, 'inbox'), 'inbox', '收件箱')
      albums = scanAlbums(dir)
    }
    return albums
  }
  const activeAlbumId = () => {
    const s = readSettings()
    const albums = listAlbums()
    const want = albumSlug(s.albumId || cfg().albumId)
    if (want && albums.some((a) => a.id === want)) return want
    return (albums[0] && albums[0].id) || 'inbox'
  }
  const enabledIds = () => {
    const s = readSettings()
    const alive = new Set(listAlbums().map((a) => a.id))
    const saved = Array.isArray(s.enabledAlbums) ? s.enabledAlbums.map(String).filter((id) => alive.has(id)) : null
    if (saved === null) return [activeAlbumId()].filter(Boolean)
    return saved
  }

  const openAlbum = (id) => {
    const hit = listAlbums().find((a) => a.id === id)
    if (!hit) return null
    return { id: hit.id, meta: hit, store: new Album(hit.path) }
  }
  let current = openAlbum(activeAlbumId())
  if (!current) {
    console.error('[dsh-gallery] 没有可用专辑，插件未完全就绪')
    return
  }
  const switchAlbum = (id) => {
    const next = openAlbum(id)
    if (!next) return false
    const prev = current
    current = next
    writeSettings({ albumId: next.id })
    if (prev && prev.store) prev.store.close()
    return true
  }

  // ---- 市场：目录 / 清单 / 安装 / 更新 / 导入导出。语义见 INTERFACE.md §9 ----
  const SIDECAR = '.dsh-remote.json'
  const remoteDirUrls = () => readSettings().remoteDirUrl || config?.remoteDirUrl || DEFAULT_REMOTE_DIR_URLS
  const remoteSubs = () => {
    const subs = readSettings().remoteSubs
    return Array.isArray(subs) ? subs : []
  }
  const remoteJobs = new Map() // jobId → job（内存态，重启即清）
  let remoteJobSeq = 0
  let remoteDirCache = null
  let downloadCache = { at: 0, data: {}, key: '' }
  const limits = () => ({
    imageExts: cfg().imageExts,
    maxItems: Number(cfg().remoteMaxItems) || 500,
  })

  /** 下载量是活数据：服务端代拉 GitHub releases，30 分钟缓存；失败当没有。 */
  const fetchDownloadCounts = async (entries) => {
    const repos = new Set()
    for (const e of (entries || [])) {
      const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\//.exec(String((e && e.archiveUrl) || ''))
      if (m) repos.add(m[1] + '/' + m[2])
    }
    const key = [...repos].sort().join(',')
    if (!key) return {}
    if (downloadCache.key === key && Date.now() - downloadCache.at < 1800000) return downloadCache.data
    const merged = {}
    for (const repo of repos) {
      try {
        const res = await netFetch('https://api.github.com/repos/' + repo + '/releases?per_page=100', {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-gallery' },
          signal: AbortSignal.timeout(8000), timeoutMs: 8000,
        })
        if (!res.ok) continue
        for (const r of await res.json()) {
          const id = String((r && r.tag_name) || '').replace(/-v[\d.]+$/i, '').trim()
          if (!id) continue
          let sum = 0
          for (const a of (Array.isArray(r && r.assets) ? r.assets : [])) sum += Number(a && a.download_count) || 0
          merged[id] = (merged[id] || 0) + sum
        }
      } catch { /* 少显示一个数字 */ }
    }
    downloadCache = { at: Date.now(), data: merged, key }
    return merged
  }

  const fetchRemoteDirectory = async () => {
    if (remoteDirCache && Date.now() - remoteDirCache.at < 60000) return remoteDirCache.data
    for (const u of [].concat(remoteDirUrls() || [])) {
      try {
        const busted = u + (u.includes('?') ? '&' : '?') + 't=' + Date.now()
        const res = await fetchWithMirror(busted, { signal: AbortSignal.timeout(8000), timeoutMs: 8000 })
        const data = normalizeDirectory(await res.json())
        remoteDirCache = { at: Date.now(), data }
        return data
      } catch { /* 试下一个源 */ }
    }
    return null
  }

  const fetchRemoteJson = async (url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('清单地址必须是 http(s) 链接')
    let res
    try {
      res = await fetchWithMirror(url, { signal: AbortSignal.timeout(15000), timeoutMs: 15000, redirect: 'follow' })
    } catch (error) {
      const cause = error && error.cause
      throw new Error('清单下载失败: ' + (cause ? (cause.code || cause.message) : (error instanceof Error ? error.message : String(error))))
    }
    if (!res.ok) throw new Error('清单下载失败: HTTP ' + res.status)
    const text = await res.text()
    if (text.length > Number(cfg().remoteMaxManifestBytes)) throw new Error('清单超过上限,拒绝处理')
    try { return JSON.parse(text) } catch { throw new Error('清单不是合法 JSON') }
  }

  const fmtBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB')

  const fetchRemoteArchive = async (url, expectedSha256, onProgress) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('ZIP 地址必须是 http(s) 链接')
    const maxArchive = Number(cfg().remoteMaxArchiveBytes) || 100 * 1024 * 1024
    const expected = String(expectedSha256 || '').trim().toLowerCase()
    if (expected && !/^[0-9a-f]{64}$/.test(expected)) throw new Error('SHA-256 格式无效')
    let res
    try {
      res = await netFetch(url, { signal: AbortSignal.timeout(180000), timeoutMs: 180000, redirect: 'follow' })
    } catch (error) {
      const cause = error && error.cause
      throw new Error('ZIP 下载失败: ' + (cause ? (cause.code || cause.message) : (error instanceof Error ? error.message : String(error))))
    }
    if (!res.ok) throw new Error('ZIP 下载失败: HTTP ' + res.status)
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > maxArchive) throw new Error('ZIP 超过上限,拒绝处理')
    const chunks = []
    let size = 0
    if (res.body && typeof res.body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of res.body) {
        size += chunk.length
        if (size > maxArchive) throw new Error('ZIP 大小超限')
        chunks.push(Buffer.from(chunk))
        if (onProgress) onProgress(size, declared)
      }
    } else {
      const one = Buffer.from(await res.arrayBuffer())
      size = one.byteLength
      chunks.push(one)
    }
    const buf = Buffer.concat(chunks)
    if (!buf.byteLength || buf.byteLength > maxArchive) throw new Error('ZIP 大小超限')
    const actual = sha256(buf)
    if (expected && actual !== expected) throw new Error('ZIP SHA-256 校验失败,文件可能损坏或已被替换')
    return { buf, sha256: actual }
  }

  const jobSnapshot = (job) => ({
    id: job.id, albumId: job.albumId, name: job.name, mode: job.mode,
    total: job.total, done: job.done, failed: job.failed,
    added: job.added, updated: job.updated, state: job.state, message: job.message,
    bytes: Number(job.bytes) || job.done,
    errors: job.errors.slice(0, 5), warnings: job.warnings.slice(0, 10),
  })

  /** 解包安装：转换格式 → 临时目录落盘 → 校验 → 原子改名 → 切换并打开开关。 */
  const installZipEntries = (entries, requestedId, sidecar) => {
    const id = packSlug(requestedId)
    if (!id) throw new Error('专辑 id 无效')
    const root = resolve(albumsDirNow())
    const targetAbs = resolve(join(root, id))
    if (!targetAbs.startsWith(root + sep)) throw new Error('专辑目录越界')
    const nonce = Math.random().toString(16).slice(2, 10)
    const stageAbs = resolve(join(root, id + '.tmp-' + nonce))
    const backupAbs = resolve(join(root, id + '.bak-' + nonce))
    if (!stageAbs.startsWith(root + sep) || !backupAbs.startsWith(root + sep)) throw new Error('临时目录越界')
    mkdirSync(stageAbs, { recursive: true })
    try {
      const conv = convertLegacyEntries(new Map(entries), stageAbs)
      const files = new Map(conv.entries)
      if (sidecar) files.set(SIDECAR, Buffer.from(JSON.stringify(sidecar, null, 2)))
      for (const [rel] of files) {
        if (!rel || /[\\/]$/.test(rel)) continue
        const full = resolve(stageAbs, rel)
        if (full === stageAbs || !full.startsWith(stageAbs + sep)) throw new Error('ZIP 条目路径越界,已拒绝导入: ' + rel)
      }
      const enabledBefore = enabledIds()
      for (const [rel, bytes] of files) {
        if (!rel || /[\\/]$/.test(rel)) continue
        const full = resolve(stageAbs, rel)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, bytes)
      }
      const verify = new DatabaseSync(join(stageAbs, 'index.db'), { readOnly: true })
      let count = 0
      try { count = Number(verify.prepare('SELECT COUNT(*) AS n FROM images').get().n) || 0 } finally { verify.close() }

      const replacingActive = resolve(current.meta.path) === targetAbs
      if (replacingActive) current.store.close()
      let backedUp = false
      try {
        if (existsSync(targetAbs)) { renameSync(targetAbs, backupAbs); backedUp = true }
        renameSync(stageAbs, targetAbs)
      } catch (error) {
        if (backedUp && !existsSync(targetAbs) && existsSync(backupAbs)) renameSync(backupAbs, targetAbs)
        if (replacingActive && existsSync(targetAbs)) switchAlbum(id)
        throw error
      }
      rmSync(backupAbs, { recursive: true, force: true })
      switchAlbum(id)
      writeSettings({ enabledAlbums: [...new Set([...enabledBefore, id])] })
      return { id, count, converted: conv.converted, from: conv.from }
    } finally {
      rmSync(stageAbs, { recursive: true, force: true })
    }
  }

  const installArchiveBuffer = (buf, hash, opts) => {
    const entries = unzipStore(buf)
    let manifest = {}
    try { manifest = JSON.parse(String(entries.get('manifest.json') || '{}')) } catch { throw new Error('manifest.json 不是合法 JSON') }
    const requestedId = packSlug(opts.requestedId)
    const manifestId = packSlug(manifest.id)
    const id = requestedId || manifestId
    if (!id) throw new Error('ZIP manifest.json 缺少有效 id')
    if (requestedId && manifestId && requestedId !== manifestId) throw new Error('目录 id 与 ZIP manifest id 不一致,已拒绝安装')
    const name = String(manifest.name || opts.name || id).trim().slice(0, 60) || id
    const version = String(manifest.version || opts.version || '').trim().slice(0, 40)
    const done = installZipEntries(entries, id, {
      sourceType: 'archive', archiveUrl: opts.archiveUrl, sha256: hash,
      id, name, version, lastSync: Date.now(),
    })
    const subs = remoteSubs().filter((s) => s && s.id !== id)
    subs.unshift({ id, archiveUrl: opts.archiveUrl, sha256: hash, name, version, total: done.count, lastSync: Date.now() })
    writeSettings({ remoteSubs: subs })
    return { ...done, name }
  }

  /** 安装走任务制：客户端轮询 remoteJobStatus 画进度条。 */
  const startArchiveJob = ({ archiveUrl, sha256: wantSha, requestedId, name, version }) => {
    const jobId = 'ra-' + Date.now().toString(36) + '-' + (++remoteJobSeq)
    const job = {
      id: jobId, albumId: packSlug(requestedId) || '', name: name || '', mode: 'archive',
      total: 0, done: 0, failed: 0, added: 0, updated: 0, warnings: [], errors: [],
      state: 'running', message: '开始下载…',
    }
    remoteJobs.set(jobId, job)
    while (remoteJobs.size > 10) remoteJobs.delete(remoteJobs.keys().next().value)
    ;(async () => {
      try {
        const { buf, sha256: actual } = await fetchRemoteArchive(archiveUrl, wantSha, (got, declared) => {
          job.done = got
          job.bytes = got
          job.total = declared
          job.message = '下载中 ' + fmtBytes(got) + (declared ? ' / ' + fmtBytes(declared) : '')
        })
        job.total = buf.byteLength
        job.done = buf.byteLength
        job.message = '校验通过,正在解包安装…'
        const done = installArchiveBuffer(buf, actual, { archiveUrl, requestedId, name, version })
        job.albumId = done.id
        job.name = done.name
        job.added = done.count
        job.state = 'done'
        job.message = '安装完成,已切换到「' + done.name + '」(' + done.count + ' 张' + (done.converted ? ', 已从 ' + done.from + ' 布局转换' : '') + ')'
      } catch (error) {
        job.state = 'error'
        job.message = error instanceof Error ? error.message : String(error)
        job.errors.push(String(job.message))
      }
    })()
    return job
  }

  const startRemoteJob = (manifest, sourceUrl, mode) => {
    const jobId = 'rj-' + Date.now().toString(36) + '-' + (++remoteJobSeq)
    const job = {
      id: jobId, albumId: manifest.id, name: manifest.name, mode,
      total: manifest.items.length, done: 0, failed: 0, added: 0, updated: 0,
      warnings: manifest.warnings.slice(0, 20), errors: [], state: 'running', message: '准备中…',
    }
    remoteJobs.set(jobId, job)
    while (remoteJobs.size > 10) remoteJobs.delete(remoteJobs.keys().next().value)
    ;(async () => {
      const root = resolve(albumsDirNow())
      const maxImage = Number(cfg().remoteMaxImageBytes) || 8 * 1024 * 1024
      const safeId = packSlug(manifest.id)
      if (!safeId) { job.state = 'error'; job.message = '远程清单缺少有效的 id,已中止(不会动本地专辑)'; return }
      manifest.id = safeId
      job.albumId = safeId
      const finalDir = resolve(join(root, safeId))
      if (!finalDir.startsWith(root + sep)) { job.state = 'error'; job.message = '专辑目录越界,已中止'; return }
      let workDir = finalDir
      let effective = mode
      if (existsSync(finalDir)) {
        let sidecar = null
        try { sidecar = JSON.parse(readFileSync(join(finalDir, SIDECAR), 'utf8')) } catch { /* 无侧车 */ }
        if (sidecar && sidecar.manifestUrl === sourceUrl) { effective = 'update'; job.mode = 'update' } else {
          job.state = 'error'
          job.message = '扫描目录下已存在同名专辑「' + safeId + '」且不是本清单下载的,请先删除或换个 id'
          return
        }
      }
      const prev = {}
      if (effective === 'update') {
        try {
          const sc = JSON.parse(readFileSync(join(finalDir, SIDECAR), 'utf8'))
          if (sc && sc.manifestUrl === sourceUrl) for (const it of sc.items || []) prev[it.url] = it
        } catch { }
      } else {
        workDir = resolve(join(root, safeId + '.tmp-' + Math.random().toString(16).slice(2, 8)))
        rmSync(workDir, { recursive: true, force: true })
        mkdirSync(workDir, { recursive: true })
      }
      const db = new DatabaseSync(join(workDir, 'index.db'))
      db.exec('CREATE TABLE IF NOT EXISTS images (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, source TEXT, sha256 TEXT, bytes INTEGER, mtime REAL, added_at REAL, used_at REAL, use_count INTEGER DEFAULT 0)')
      job.message = (effective === 'update' ? '更新中 ' : '下载中 ') + '0/' + job.total
      try {
        const queue = manifest.items.slice()
        let active = 0
        await new Promise((allDone) => {
          const pump = () => {
            while (active < (Number(cfg().remoteConcurrency) || 4) && queue.length) {
              const item = queue.shift()
              active++
              ;(async () => {
                const known = prev[item.url]
                if (known && known.path === item.rel && existsSync(join(workDir, item.rel))) {
                  db.prepare('UPDATE images SET tag = ?, caption = ?, keywords = ? WHERE path = ?')
                    .run(item.tag, item.caption, item.keywords, item.rel)
                  job.updated++
                } else {
                  let res
                  try {
                    res = await fetchWithMirror(item.url, { signal: AbortSignal.timeout(20000), timeoutMs: 20000, redirect: 'follow' })
                  } catch (error) {
                    const cause = error && error.cause
                    throw new Error('下载失败: ' + (cause ? (cause.code || cause.message) : (error instanceof Error ? error.message : String(error))))
                  }
                  if (!res.ok) throw new Error('HTTP ' + res.status)
                  const buf = Buffer.from(await res.arrayBuffer())
                  if (!buf.byteLength || buf.byteLength > maxImage) throw new Error('图片大小超限')
                  mkdirSync(join(workDir, 'images', item.tag), { recursive: true })
                  writeFileSync(join(workDir, item.rel), buf)
                  if (known && known.path !== item.rel) {
                    try { rmSync(join(workDir, known.path), { force: true }) } catch { }
                    db.prepare('DELETE FROM images WHERE path = ?').run(known.path)
                  }
                  db.prepare('INSERT OR REPLACE INTO images (path, tag, file_name, caption, keywords, source, sha256, bytes, mtime, added_at, used_at, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .run(item.rel, item.tag, item.fileName, item.caption, item.keywords, 'url:' + item.url,
                      sha256(buf), buf.byteLength, Date.now(), Date.now(), null, 0)
                  job.added++
                }
                job.done++
                prev[item.url] = { url: item.url, path: item.rel }
              })().catch((error) => {
                job.failed++
                if (job.errors.length < 20) job.errors.push(item.url.slice(0, 80) + ' — ' + (error instanceof Error ? error.message : String(error)))
              }).finally(() => {
                active--
                job.message = (effective === 'update' ? '更新中 ' : '下载中 ') + (job.done + job.failed) + '/' + job.total
                pump()
              })
            }
            if (active === 0) allDone()
          }
          pump()
        })
      } finally { db.close() }
      writeFileSync(join(workDir, SIDECAR), JSON.stringify({
        manifestUrl: sourceUrl, id: manifest.id, name: manifest.name, version: manifest.version, lastSync: Date.now(),
        items: Object.values(prev),
      }))
      if (effective === 'fresh') {
        writeFileSync(join(workDir, 'manifest.json'), JSON.stringify({
          id: manifest.id, name: manifest.name, description: manifest.description, version: manifest.version, source: sourceUrl,
        }, null, 2))
        rmSync(finalDir, { recursive: true, force: true })
        renameSync(workDir, finalDir)
        const enabledBefore = enabledIds()
        switchAlbum(manifest.id)
        writeSettings({ enabledAlbums: [...new Set([...enabledBefore, manifest.id])] })
        job.message = '完成:下载 ' + job.added + '/' + job.total + ' 张并已切换到「' + manifest.name + '」' + (job.failed ? '(失败 ' + job.failed + ' 张)' : '')
      } else {
        job.message = '完成:新增 ' + job.added + ' 张,刷新元数据 ' + job.updated + ' 张' + (job.failed ? ',失败 ' + job.failed + ' 张' : '')
      }
      const subs = remoteSubs().filter((s) => s && s.id !== manifest.id)
      subs.unshift({ id: manifest.id, url: sourceUrl, name: manifest.name, version: manifest.version, total: job.total, lastSync: Date.now() })
      writeSettings({ remoteSubs: subs })
      job.state = job.failed ? 'done-with-errors' : 'done'
    })().catch((error) => {
      job.state = 'error'
      job.message = '失败: ' + (error instanceof Error ? error.message : String(error))
    })
    return job
  }

  /** 导出专辑为未压缩 ZIP（只打包索引里列到的图）。语义见 INTERFACE.md §9.4。 */
  const exportAlbumZip = (albumId) => {
    const albums = listAlbums()
    const hit = albums.find((a) => a.id === albumId) || albums.find((a) => a.id === current.id)
    if (!hit) throw new Error('专辑不存在: ' + albumId)
    const root = resolve(hit.path)
    const db = new DatabaseSync(join(root, 'index.db'), { readOnly: true })
    let paths = []
    try { paths = db.prepare('SELECT path FROM images').all().map((r) => String(r.path)) } finally { db.close() }
    if (paths.length === 0) throw new Error('空专辑没有可导出的图片')
    const files = [{ name: 'index.db', data: readFileSync(join(root, 'index.db')) }]
    if (existsSync(join(root, 'manifest.json'))) files.push({ name: 'manifest.json', data: readFileSync(join(root, 'manifest.json')) })
    for (const rel of paths) {
      const full = resolveInAlbum(root, rel)
      if (existsSync(full)) files.push({ name: rel, data: readFileSync(full) })
    }
    return { zip: zipStore(files), id: hit.id }
  }

  // ---- 来源 → 字节：语义见 INTERFACE.md §5.1 ----
  const extForName = (name, fallbackExt) => {
    const ext = String(extname(String(name || '')) || '').toLowerCase()
    return cfg().imageExts.includes(ext) ? ext : fallbackExt
  }
  const checkSize = (bytes) => {
    const max = Number(cfg().maxImageBytes)
    if (!bytes || bytes <= 0) throw new Error('图片为空')
    if (bytes > max) throw new Error('图片超限(' + Math.round(max / 1048576) + 'MB 以内)')
  }
  const expandHome = (p) => {
    const s = String(p || '').trim()
    if (s === '~') return homedir()
    if (s.startsWith('~/')) return join(homedir(), s.slice(2))
    return s
  }
  const readLocalFile = (file) => {
    const abs = resolve(expandHome(file))
    if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error('文件不存在: ' + abs)
    const ext = extForName(abs, '')
    if (!ext) throw new Error('不是支持的图片格式(jpg/png/gif/webp): ' + basename(abs))
    const buf = readFileSync(abs)
    checkSize(buf.byteLength)
    return { buf, ext, name: basename(abs), source: 'file:' + abs }
  }
  const downloadImage = async (url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('url 必须是 http(s) 链接')
    let res
    try {
      res = await fetchWithMirror(url, { signal: AbortSignal.timeout(15000), timeoutMs: 15000, redirect: 'follow' })
    } catch (error) {
      const cause = error && error.cause
      throw new Error('下载失败: ' + (cause ? (cause.code || cause.message) : String(error && error.message || error)))
    }
    if (!res.ok) throw new Error('下载失败: HTTP ' + res.status)
    const ctype = String(res.headers.get('content-type') || '')
    const m = /image\/(jpeg|png|gif|webp)/.exec(ctype)
    const ext = m ? '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]) : extForName(url.split('?')[0], '')
    if (!ext) throw new Error('该 URL 不是图片(jpg/png/gif/webp)')
    const buf = Buffer.from(await res.arrayBuffer())
    checkSize(buf.byteLength)
    return { buf, ext, name: decodeURIComponent((url.split('?')[0].split('/').pop() || 'image')), source: 'url:' + url }
  }
  const takeImageRefs = (content, out) => {
    if (!Array.isArray(content)) return
    for (const b of content) {
      if (b && b.type === 'image' && b.attachment) out.push(b.attachment)
      if (b && b.type === 'tool-result') takeImageRefs(b.content, out)
    }
  }
  /** 会话里用户发过的图片附件（模型 prompt 里没有 attachmentId）。 */
  const userImageRefs = (exec) => {
    const out = []
    const agent = exec && exec.agent
    const inbox = agent && agent.inbox
    if (inbox) {
      for (const msg of [...(inbox.nextTurn || []), ...(inbox.nextStep || [])]) takeImageRefs(msg.content, out)
    }
    const session = agent && agent.session
    if (session && typeof session.deriveMessages === 'function') {
      for (const msg of session.deriveMessages()) {
        if (msg && msg.role === 'user') takeImageRefs(msg.content, out)
      }
    }
    return out
  }
  const readAttachment = async (exec, attachmentId) => {
    const service = ctx.get('attachments')
    if (!service || typeof service.readImage !== 'function') throw new Error('宿主没有 attachments 服务')
    const refs = userImageRefs(exec)
    const ref = attachmentId
      ? refs.find((r) => String(r.attachmentId) === String(attachmentId))
      : refs[refs.length - 1]
    if (!ref) {
      throw new Error(attachmentId ? '找不到附件 ' + attachmentId + '(必须是本次对话上传的图片)' : '对话里没有用户图片附件')
    }
    const stored = await service.readImage(ref)
    const name = stored.ref.name || 'image' + (stored.ref.mediaType === 'image/png' ? '.png' : '.jpg')
    const ext = extForName(name, null) || Object.entries(MIME).find(([, v]) => v === stored.ref.mediaType)?.[0] || '.jpg'
    checkSize(stored.data.byteLength)
    return { buf: stored.data, ext, name, source: 'attachment:' + (stored.ref.attachmentId || '') }
  }

  const inferTag = (caption, keywords) => {
    const text = String(caption || '') + ' ' + String(keywords || '')
    const hit = /[\u4e00-\u9fff]{2,6}|[a-z0-9]{3,12}/i.exec(text)
    return hit ? safeTag(hit[0]) : 'unsorted'
  }

  // ---- 模型工具：语义见 INTERFACE.md §5 ----
  ctx.tools.register(defineTool({
    name: 'save_image',
    description: '收藏一张图片进「图片收藏」专辑。' +
      '来源三选一:①用户刚发的图片附件(不传来源参数,默认取最近一张);②本地文件路径 file;③网图 URL url。' +
      '仅当用户明确要求收藏/保存/收进图库时使用。' +
      '同一张图重复收藏会按内容哈希去重,不会存第二份。tag/caption/keywords 可选,会用于以后检索。',
    parameters: {
      file: { type: 'string', description: '可选。本地图片文件的绝对路径(截图/下载目录里的图)' },
      url: { type: 'string', description: '可选。图片 http(s) 直链,与 file、附件三选一' },
      attachmentId: { type: 'string', description: '可选。对话附件 id;不传则用最近一张用户图片' },
      tag: { type: 'string', description: '可选。分类(如 风景/截图/表情),决定在专辑里的分组;不传则从 caption 推断' },
      caption: { type: 'string', description: '可选。一句话描述,以后按它检索' },
      keywords: { type: 'string', description: '可选。空格分隔的检索词' },
      album: { type: 'string', description: '可选。存进哪个专辑(默认当前专辑)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args, exec) {
      const target = args.album ? albumSlug(args.album) : current.id
      const album = target === current.id ? current.store : (openAlbum(target) || {}).store
      if (!album) return { ok: false, message: '未知专辑: ' + args.album }
      const own = target !== current.id
      try {
        let picked
        const url = String(args.url || '').trim()
        const file = String(args.file || '').trim()
        if (url && file) return { ok: false, message: 'url 与 file 只能给一个' }
        if (file) picked = readLocalFile(file)
        else if (url) picked = await downloadImage(url)
        else picked = await readAttachment(exec, String(args.attachmentId || '').trim())

        const hash = sha256(picked.buf)
        const dup = album.findBySha(hash)
        if (dup) {
          return {
            ok: true, deduped: true, rel: dup.path, tag: dup.tag, caption: dup.caption,
            url: urlFor(target, dup.path), markdown: markdownFor(dup.caption, urlFor(target, dup.path)),
            message: '这张图已经在专辑「' + target + '」里了(内容相同),没有重复收藏: ' + dup.path,
          }
        }
        const caption = String(args.caption || '').trim().slice(0, 200)
        const keywords = String(args.keywords || '').trim().slice(0, 200)
        const tag = safeTag(args.tag) || inferTag(caption, keywords)
        const rel = writeImage(album, {
          buf: picked.buf, ext: picked.ext, tag, caption, keywords,
          source: picked.source, hash, name: args.name || picked.name,
        })
        const absUrl = urlFor(target, rel)
        return {
          ok: true, deduped: false, rel, tag, caption, url: absUrl,
          markdown: markdownFor(caption, absUrl),
          message: '已收藏 [' + tag + '] ' + (caption || basename(rel)) + ' → 专辑「' + target + '」' + rel +
            '\n发图时把这段原样写进回复即可: ' + markdownFor(caption, absUrl),
        }
      } catch (error) {
        return { ok: false, message: '收藏失败: ' + (error instanceof Error ? error.message : String(error)) }
      } finally {
        if (own && album) album.close()
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'send_image',
    description: '从「图片收藏」里找图发给用户。' +
      '给 query(关键词,如「猫」「日落」)按描述检索;给 tag 按分类取;两个都不给则随机给几张。' +
      '返回若干条候选,每条带一段 markdown 图片 —— 把你要发的那条的 markdown 整段原样写进回复,界面就会显示出图片;' +
      '不要改动 URL、不要自己编 URL。没命中就换词或老实说没有,不要硬发。',
    parameters: {
      query: { type: 'string', description: '关键词,在描述/检索词/文件名/分类里搜,空格分隔多个词(全部命中的优先)' },
      tag: { type: 'string', description: '只在某个分类里找' },
      limit: { type: 'number', description: '返回几条候选(默认 6)' },
      pick: { type: 'string', description: '可选。你实际发出的那条的 rel 路径,用于记账' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    execute(args) {
      const ids = enabledIds()
      if (ids.length === 0) return { ok: false, message: '没有打开任何专辑,去设置页「图片收藏」把专辑开关打开' }
      const limit = clampLimit(args.limit, cfg().sendLimitMax)
      const rows = []
      for (const id of ids) {
        const open = id === current.id ? { id, store: current.store, own: false } : { id, store: (openAlbum(id) || {}).store, own: true }
        if (!open.store) continue
        try {
          for (const row of open.store.list().images) rows.push({ ...row, albumId: id })
        } catch { /* 坏专辑跳过 */ } finally { if (open.own) open.store.close() }
      }
      const picked = String(args.pick || '').trim()
      if (picked) {
        const hit = rows.find((r) => r.path === picked || r.albumId + '/' + r.path === picked)
        if (hit) {
          const store = hit.albumId === current.id ? current.store : (openAlbum(hit.albumId) || {}).store
          if (store) { try { store.touch(hit.path) } finally { if (hit.albumId !== current.id) store.close() } }
        }
      }
      if (rows.length === 0) return { ok: false, message: '专辑里还没有图片。让用户先收藏几张,或用设置页上传。' }

      const tag = String(args.tag || '').trim().toLowerCase()
      const scoped = tag ? rows.filter((r) => String(r.tag || '').toLowerCase() === tag) : rows
      const query = String(args.query || '').trim()
      let hits
      let mode
      if (query) {
        const found = searchImages(scoped, query, limit)
        hits = found.images
        mode = 'query'
        if (hits.length === 0) {
          return {
            ok: false,
            message: '关键词「' + (found.query || query) + '」没找到图' +
              (tag ? '(限在分类 ' + tag + ' 内)' : '') + '。换个词,或先让用户收藏几张带描述的图。',
          }
        }
      } else {
        const pool = scoped.slice()
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          const t = pool[i]; pool[i] = pool[j]; pool[j] = t
        }
        hits = pool.slice(0, limit)
        mode = tag ? 'tag' : 'random'
      }
      const uses = hits.map((r) => ({
        rel: r.path, albumId: r.albumId, tag: r.tag, caption: r.caption,
        url: urlFor(r.albumId, r.path),
        markdown: markdownFor(r.caption, urlFor(r.albumId, r.path)),
      }))
      return {
        ok: true, mode, count: uses.length, candidates: uses,
        message: '找到 ' + uses.length + ' 张候选。把你要发的那条的 markdown 整段原样写进回复(不要改 URL):\n' +
          uses.map((u, i) => (i + 1) + '. [' + u.tag + '] ' + (u.caption || u.rel) + '\n   ' + u.markdown).join('\n'),
      }
    },
  }))

  // ---- HTTP：图片路由 + 管理 API。语义见 INTERFACE.md §6 / §7 ----
  const originFromReq = (req) => {
    const host = String((req.headers && req.headers.host) || '')
    if (!/^[a-z0-9.\-]+(:\d+)?$/i.test(host)) return ''
    const proto = String((req.headers && req.headers['x-forwarded-proto']) || 'http').split(',')[0].trim() || 'http'
    return proto + '://' + host
  }

  if (webServer) {
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler(req, res) {
        const fromHeader = originFromReq(req)
        if (fromHeader) lastOrigin = fromHeader
        // req.url 是原始请求行：中文/空格是百分号编码的，而索引里存的是解码后的路径，
        // 不先解码则白名单永远不命中（中文分类的图会全部 404）。
        let pathname = String(req.url || '').split('?')[0]
        try { pathname = decodeURIComponent(pathname) } catch { /* 非法编码就按原样比 */ }
        const raw = pathname.startsWith(ROUTE + '/') ? pathname.slice(ROUTE.length + 1) : ''
        if (!raw) { res.writeHead(404); res.end('not found'); return }
        // 先按「<专辑id>/<rel>」解释,白名单不中再退回「当前专辑 + 整条 rel」
        const slash = raw.indexOf('/')
        const first = slash > 0 ? raw.slice(0, slash) : ''
        const candidates = []
        if (first && first !== 'images' && listAlbums().some((a) => a.id === first)) {
          candidates.push([first, raw.slice(slash + 1)])
        }
        candidates.push([current.id, raw])
        for (const [albumId, rel] of candidates) {
          if (!rel || !IMAGE_REL_RE.test(rel)) continue
          const hit = albumId === current.id ? current.store.has(rel) : (() => {
            const open = openAlbum(albumId)
            if (!open) return false
            try { return open.store.has(rel) } finally { open.store.close() }
          })()
          if (!hit) continue
          const meta = listAlbums().find((a) => a.id === albumId)
          if (!meta) break
          try {
            const bytes = readFileSync(resolveInAlbum(meta.path, rel))
            res.writeHead(200, {
              'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream',
              'Content-Length': String(bytes.byteLength),
              'Cache-Control': 'public, max-age=3600',
            })
            res.end(bytes)
          } catch {
            res.writeHead(404); res.end('not found')
          }
          return
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('not found')
      },
    }), 'dsh-gallery: 图片路由')

    const readBody = (req, maxBytes = 32 * 1024 * 1024) => new Promise((ok, fail) => {
      const chunks = []
      let total = 0
      req.on('data', (c) => {
        total += c.length
        if (total > maxBytes) { fail(new Error('请求体过大')); return }
        chunks.push(c)
      })
      req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
      req.on('error', fail)
    })
    const json = (res, obj, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(obj))
    }
    const rowOut = (row, albumId) => ({
      path: row.path, tag: row.tag, file_name: row.file_name, caption: row.caption,
      keywords: row.keywords, source: row.source, bytes: row.bytes, added_at: row.added_at,
      albumId, url: urlFor(albumId, row.path),
    })
    const payload = (albumId) => {
      const albums = listAlbums()
      const enabled = enabledIds()
      const active = albumId || activeAlbumId()
      const hit = albums.find((a) => a.id === active) || albums[0]
      let images = []
      let tags = []
      if (hit) {
        const open = hit.id === current.id ? { store: current.store, own: false } : { store: (openAlbum(hit.id) || {}).store, own: true }
        if (open.store) {
          try {
            const r = open.store.list({ tag: undefined, q: undefined })
            images = r.images.map((row) => rowOut(row, hit.id))
            tags = r.tags
          } finally { if (open.own) open.store.close() }
        }
      }
      return {
        ok: true,
        albumId: hit ? hit.id : '',
        albumsDir: albumsDirNow(),
        enabledAlbums: enabled,
        total: images.length,
        tags,
        images,
        albums: albums.map((a) => ({
          id: a.id, name: a.name, description: a.description, version: a.version, count: a.count,
          cover: a.cover ? urlFor(a.id, a.cover) : '',
          enabled: enabled.includes(a.id),
        })),
        remoteSubs: remoteSubs(),
        remoteDirUrl: readSettings().remoteDirUrl || '',
        remoteSources: remoteDirUrls(),
      }
    }

    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: API,
      async handler(req, res) {
        const fromHeader = originFromReq(req)
        if (fromHeader) lastOrigin = fromHeader
        try {
          if (req.method === 'GET') {
            const u = new URL(req.url || '/', 'http://localhost')
            const want = albumSlug(u.searchParams.get('albumId') || '')
            const tag = u.searchParams.get('tag') || ''
            const q = u.searchParams.get('q') || ''
            if (u.searchParams.has('remoteDir')) {
              const dir = await fetchRemoteDirectory()
              let counts = {}
              try { counts = await fetchDownloadCounts(dir || []) } catch { /* 只是少个数字 */ }
              json(res, {
                ok: true,
                remoteDir: (dir || []).map((e) => ({ ...e, downloads: counts[e.id] || 0 })),
                remoteDirUrl: readSettings().remoteDirUrl || '',
                remoteSources: remoteDirUrls(),
                albums: payload(activeAlbumId()).albums,
              })
              return
            }
            if (want === 'all') {
              const all = []
              let tags = []
              for (const a of listAlbums()) {
                const open = a.id === current.id ? { store: current.store, own: false } : { store: (openAlbum(a.id) || {}).store, own: true }
                if (!open.store) continue
                try {
                  const r = open.store.list()
                  all.push(...r.images.map((row) => rowOut(row, a.id)))
                  if (r.tags.length) tags = r.tags
                } finally { if (open.own) open.store.close() }
              }
              json(res, { ...payload(activeAlbumId()), total: all.length, images: all, tags })
              return
            }
            const base = payload(want || activeAlbumId())
            if (tag || q) {
              const hit = listAlbums().find((a) => a.id === base.albumId)
              if (hit) {
                const open = hit.id === current.id ? { store: current.store, own: false } : { store: (openAlbum(hit.id) || {}).store, own: true }
                if (open.store) {
                  try {
                    const r = open.store.list({ tag, q })
                    base.images = r.images.map((row) => rowOut(row, hit.id))
                    base.total = base.images.length
                  } finally { if (open.own) open.store.close() }
                }
              }
            }
            json(res, base)
            return
          }
          // 状态变更：校验 Origin 与 Host 同源（无 Origin 的本地脚本放行）
          const origin = req.headers.origin
          if (origin) {
            let same = false
            try { same = new URL(origin).host === String(req.headers.host || '') } catch { same = false }
            if (!same) { json(res, { ok: false, error: '跨站请求被拒绝' }, 403); return }
          }
          let body
          try { body = JSON.parse(await readBody(req)) } catch { json(res, { ok: false, error: '无效的 JSON 请求体' }, 400); return }
          const op = String(body.op || '')
          const wantAlbum = albumSlug(body.albumId) || current.id
          const hitAlbum = listAlbums().find((a) => a.id === wantAlbum)
          const withAlbum = (fn) => {
            if (!hitAlbum) throw new Error('未知专辑: ' + wantAlbum)
            const own = hitAlbum.id !== current.id
            const store = own ? (openAlbum(hitAlbum.id) || {}).store : current.store
            if (!store) throw new Error('专辑打不开: ' + wantAlbum)
            try { fn(store) } finally { if (own) store.close() }
          }

          if (op === 'list') {
            json(res, payload(wantAlbum))
          } else if (op === 'upload') {
            const data = String(body.dataBase64 || '')
            if (!data) throw new Error('缺少图片数据')
            const buf = Buffer.from(data, 'base64')
            checkSize(buf.byteLength)
            const ext = extForName(body.fileName, null)
            if (!ext) throw new Error('仅支持 jpg/png/gif/webp')
            const caption = String(body.caption || '').trim().slice(0, 200)
            const keywords = String(body.keywords || '').trim().slice(0, 200)
            const tag = safeTag(body.tag) || inferTag(caption, keywords)
            let rel = ''
            withAlbum((store) => {
              const hash = sha256(buf)
              const dup = store.findBySha(hash)
              if (dup) { rel = dup.path; return }
              rel = writeImage(store, { buf, ext, tag, caption, keywords, source: 'upload', hash, name: body.fileName })
            })
            json(res, { ...payload(wantAlbum), rel, message: '已上传' })
          } else if (op === 'update') {
            withAlbum((store) => { store.update(String(body.path || ''), { tag: safeTag(body.tag) || undefined, caption: body.caption, keywords: body.keywords }) })
            json(res, { ...payload(wantAlbum), message: '已保存' })
          } else if (op === 'delete') {
            withAlbum((store) => { store.remove(String(body.path || '')) })
            json(res, { ...payload(wantAlbum), message: '已删除' })
          } else if (op === 'deleteTag') {
            let n = 0
            withAlbum((store) => { n = store.removeTag(safeTag(body.tag)) })
            json(res, { ...payload(wantAlbum), deleted: n, message: '已删除该分类及其图片' })
          } else if (op === 'touch') {
            withAlbum((store) => { store.touch(String(body.path || '')) })
            json(res, { ok: true })
          } else if (op === 'createAlbum') {
            const id = albumSlug(body.id)
            const name = String(body.name || '').trim()
            if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)) throw new Error('专辑 ID 须为 1–40 位小写字母、数字、横线或下划线')
            if (!name || name.length > 60) throw new Error('专辑名称须为 1–60 字')
            if (listAlbums().some((a) => a.id === id)) throw new Error('专辑 ID 已存在')
            const enabledBefore = enabledIds()
            ensureAlbum(join(albumsDirNow(), id), id, name)
            switchAlbum(id)
            writeSettings({ enabledAlbums: [...new Set([...enabledBefore, id])] })
            json(res, { ...payload(id), message: '已创建并切换到「' + name + '」' })
          } else if (op === 'setAlbum') {
            if (!switchAlbum(wantAlbum)) throw new Error('未知专辑: ' + wantAlbum)
            json(res, { ...payload(wantAlbum), message: '已切换专辑' })
          } else if (op === 'setAlbumsDir') {
            const dir = resolve(String(body.albumsDir || '').trim())
            if (!dir) throw new Error('目录不能为空')
            if (isAlbumDir(dir)) throw new Error('这个目录本身就是一个专辑,请选它的上级目录')
            mkdirSync(dir, { recursive: true })
            writeSettings({ albumsDir: dir })
            const albums = listAlbums()
            if (albums.length && !albums.some((a) => a.id === current.id)) {
              switchAlbum(albums[0].id)
            }
            json(res, { ...payload(activeAlbumId()), message: '已更新扫描目录' })
          } else if (op === 'setAlbumEnabled') {
            const target = albumSlug(body.albumId)
            if (!listAlbums().some((a) => a.id === target)) throw new Error('专辑不存在: ' + target)
            const cur = enabledIds()
            const next = body.enabled !== false ? [...new Set([...cur, target])] : cur.filter((id) => id !== target)
            writeSettings({ enabledAlbums: next })
            json(res, { ...payload(activeAlbumId()), message: next.includes(target) ? '已打开,模型可以用它找图' : '已关闭' })
          } else if (op === 'deleteAlbum') {
            const target = albumSlug(body.albumId)
            const albums = listAlbums()
            const want = albums.find((a) => a.id === target)
            if (!want) throw new Error('专辑不存在: ' + target)
            if (albums.length <= 1) throw new Error('这是最后一个专辑,删掉就没有可用的了')
            const root = albumsDirNow()
            const dir = resolve(want.path)
            if (!dir.startsWith(root + sep)) throw new Error('专辑目录与预期不符,已拒绝删除')
            let switched = ''
            if (current.id === target) {
              const next = albums.find((a) => a.id !== target)
              switchAlbum(next.id)
              switched = next.name || next.id
            }
            rmAlbumDir(dir)
            writeSettings({ enabledAlbums: enabledIds().filter((id) => id !== target) })
            json(res, { ...payload(activeAlbumId()), message: '已删除专辑「' + (want.name || target) + '」' + (switched ? ',当前已切到「' + switched + '」' : '') })
          } else if (op === 'remoteDir') {
            const dir = await fetchRemoteDirectory()
            let counts = {}
            try { counts = await fetchDownloadCounts(dir || []) } catch { /* 只是少个数字 */ }
            json(res, {
              ok: true,
              remoteDir: (dir || []).map((e) => ({ ...e, downloads: counts[e.id] || 0 })),
              remoteDirUrl: readSettings().remoteDirUrl || '',
              remoteSources: remoteDirUrls(),
            })
          } else if (op === 'setRemoteDirUrl') {
            const url = String(body.remoteDirUrl || '').trim()
            if (url && !/^https?:\/\//i.test(url)) throw new Error('目录源必须是 http(s) 链接')
            writeSettings({ remoteDirUrl: url || null })
            remoteDirCache = null
            json(res, { ok: true, remoteDirUrl: url, remoteSources: remoteDirUrls(), message: url ? '已切换目录源' : '已恢复内置默认目录源' })
          } else if (op === 'installRemoteArchive') {
            const archiveUrl = String(body.archiveUrl || '').trim()
            if (!archiveUrl) throw new Error('缺少 archiveUrl')
            const wanted = packSlug(body.packId)
            for (const j of remoteJobs.values()) {
              if (j.mode === 'archive' && j.state === 'running' && wanted && j.albumId === wanted) {
                json(res, { ok: true, ...jobSnapshot(j), running: true, message: '该专辑已在下载中' })
                return
              }
            }
            json(res, {
              ok: true,
              ...jobSnapshot(startArchiveJob({
                archiveUrl, sha256: body.sha256,
                requestedId: body.packId, name: body.name, version: body.version,
              })),
            })
          } else if (op === 'subscribeRemote') {
            const manifestUrl = String(body.manifestUrl || '').trim()
            const raw = await fetchRemoteJson(manifestUrl)
            const manifest = normalizeRemoteManifest(raw, String(body.packId || '').trim(), manifestUrl, limits())
            for (const j of remoteJobs.values()) {
              if (j.albumId === manifest.id && j.state === 'running') {
                json(res, { ok: true, ...jobSnapshot(j), running: true, message: '该专辑已在下载中' })
                return
              }
            }
            json(res, { ok: true, ...jobSnapshot(startRemoteJob(manifest, manifestUrl, 'fresh')) })
          } else if (op === 'previewManifest') {
            const manifestUrl = String(body.manifestUrl || '').trim()
            const raw = await fetchRemoteJson(manifestUrl)
            const manifest = normalizeRemoteManifest(raw, '', manifestUrl, limits())
            json(res, {
              ok: true,
              total: manifest.items.length,
              urls: manifest.items.slice(0, Number(cfg().previewMax) || 60).map((m) => m.url),
            })
          } else if (op === 'remoteJobStatus') {
            const job = remoteJobs.get(String(body.jobId || '').trim())
            if (!job) throw new Error('未知任务: ' + String(body.jobId || ''))
            json(res, { ok: true, ...jobSnapshot(job) })
          } else if (op === 'updateRemotePack') {
            const id = packSlug(body.albumId || body.id)
            const sub = remoteSubs().find((s) => s && s.id === id)
            if (!sub) throw new Error('未找到订阅: ' + id)
            if (sub.archiveUrl) {
              const { buf, sha256: actual } = await fetchRemoteArchive(sub.archiveUrl, sub.sha256)
              const done = installArchiveBuffer(buf, actual, {
                archiveUrl: sub.archiveUrl, requestedId: id, name: sub.name, version: sub.version,
              })
              json(res, { ...payload(id), message: '更新成功,已切换到「' + done.name + '」(' + done.count + ' 张)' })
              return
            }
            if (!sub.url) throw new Error('订阅缺少更新地址: ' + id)
            const raw = await fetchRemoteJson(sub.url)
            const manifest = normalizeRemoteManifest(raw, id, sub.url, limits())
            manifest.id = id
            for (const j of remoteJobs.values()) {
              if (j.albumId === id && j.state === 'running') {
                json(res, { ok: true, ...jobSnapshot(j), running: true, message: '该专辑已在更新中' })
                return
              }
            }
            json(res, { ok: true, ...jobSnapshot(startRemoteJob(manifest, sub.url, 'update')) })
          } else if (op === 'importAlbum') {
            const data = String(body.dataBase64 || '')
            if (!data) throw new Error('缺少 ZIP 数据')
            const entries = unzipStore(Buffer.from(data, 'base64'))
            const requested = packSlug(body.albumId) || packSlug(body.name)
            let manifest = {}
            try { manifest = JSON.parse(String(entries.get('manifest.json') || '{}')) } catch { throw new Error('manifest.json 不是合法 JSON') }
            const done = installZipEntries(entries, requested || manifest.id, null)
            json(res, { ...payload(done.id), message: '导入成功,已切换到新专辑(' + done.count + ' 张' + (done.converted ? ', 已从 ' + done.from + ' 布局转换' : '') + ')' })
          } else if (op === 'exportAlbum' || op === 'exportAlbumUrl') {
            // 返回下载地址（ZIP 字节由 GET /dsh-gallery-export 给）。语义见 INTERFACE.md §9.4
            const id = albumSlug(body.albumId) || current.id
            json(res, { ok: true, albumId: id, url: '/dsh-gallery-export?albumId=' + encodeURIComponent(id) })
          } else if (op === 'browse') {
            let dir = resolve(String(body.path || '').trim() || albumsDirNow())
            if (!existsSync(dir)) dir = homedir()
            const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
              .map((e) => ({ name: e.name, path: join(dir, e.name) }))
              .sort((a, b) => a.name.localeCompare(b.name))
            json(res, { ok: true, path: dir, parent: dirname(dir) === dir ? '' : dirname(dir), entries })
          } else {
            json(res, { ok: false, error: '未知操作: ' + op }, 400)
          }
        } catch (error) {
          json(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 400)
        }
      },
    }), 'dsh-gallery: 管理 API')

    // 导出专辑 ZIP（分享/备份）。语义见 INTERFACE.md §9.4
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/dsh-gallery-export',
      handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }); res.end(); return }
        try {
          const wanted = new URL(req.url || '/', 'http://localhost').searchParams.get('albumId') || current.id
          const { zip, id } = exportAlbumZip(wanted)
          const stamp = new Date().toISOString().slice(0, 10)
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Length': String(zip.byteLength),
            'Content-Disposition': 'attachment; filename="dsh-gallery-' + id + '-' + stamp + '.zip"',
          })
          res.end(zip)
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('导出失败: ' + (error instanceof Error ? error.message : String(error)))
        }
      },
    }), 'dsh-gallery: 导出 ZIP')

    // 对话里的图别贴脸：只限制本插件路由的图。语义见 INTERFACE.md §2（值见 config.js）
    const maxPx = Number(cfg().displayMaxPx) > 0 ? Number(cfg().displayMaxPx) : 240
    try {
      ctx.effect(() => webServer.tapIndex((html) => html.replace(
        '</head>',
        '<style>img[src*="' + ROUTE + '/"]{max-width:' + maxPx + 'px!important;max-height:' + maxPx + 'px!important;width:auto!important;height:auto!important;object-fit:contain;border-radius:8px}</style></head>',
      )), 'dsh-gallery: 小图 CSS')
    } catch (error) {
      console.error('[dsh-gallery] tapIndex 失败:', error && error.message)
    }
  }

  console.log('[dsh-gallery] 就绪：专辑「' + current.id + '」@ ' + current.meta.path + ' , API ' + API + ' , 图片路由 ' + ROUTE)
}

function clampLimit(n, max) {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return 6
  return Math.max(1, Math.min(Number(max) || 20, Math.floor(x)))
}

function rmAlbumDir(dir) {
  // 单独抽出：删专辑是唯一会递归删目录的动作，调用点必须已做过前缀校验
  rmSync(dir, { recursive: true, force: true })
}
