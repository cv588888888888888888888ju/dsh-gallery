/**
 * dsh-gallery 存储层：专辑目录 + SQLite 索引 + 去重 + 检索。
 * 语义见 INTERFACE.md §3 / §4 / §5.2。
 *
 * 本模块**不依赖任何 DSH 包**，可脱离宿主单测。
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'

const SCHEMA = `CREATE TABLE IF NOT EXISTS images (
  path TEXT PRIMARY KEY,
  tag TEXT,
  file_name TEXT,
  caption TEXT,
  keywords TEXT,
  source TEXT,
  sha256 TEXT,
  bytes INTEGER,
  mtime REAL,
  added_at REAL,
  used_at REAL,
  use_count INTEGER DEFAULT 0
)`

const COLS = 'path, tag, file_name, caption, COALESCE(keywords, \'\') AS keywords, COALESCE(source, \'\') AS source, COALESCE(sha256, \'\') AS sha256, bytes, mtime, added_at, used_at, COALESCE(use_count, 0) AS use_count'

export function albumSlug(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** 分类名 → 目录安全名：保留中英文数字与 -_，其余折叠成 _。语义见 INTERFACE.md §4。 */
export function safeTag(s) {
  const t = String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return t.slice(0, 24)
}

export function isAlbumDir(dir) {
  try {
    return statSync(dir).isDirectory() && existsSync(join(dir, 'index.db'))
  } catch {
    return false
  }
}

/** 建专辑（幂等）：目录 + index.db + manifest.json。 */
export function ensureAlbum(dir, id, name = '') {
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'index.db'))
  try { db.exec(SCHEMA) } finally { db.close() }
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, JSON.stringify({
      id, name: name || id, description: '', version: '1.0.0', createdAt: Date.now(),
    }, null, 2))
  }
  return dir
}

export function readAlbumMeta(dir, id = basename(dir), source = 'user') {
  let name = id
  let description = ''
  let version = ''
  try {
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    if (m && m.name) name = String(m.name)
    if (m && m.description) description = String(m.description)
    if (m && m.version) version = String(m.version)
  } catch { /* 无 manifest 也能当专辑 */ }
  let count = 0
  let cover = ''
  try {
    const db = new DatabaseSync(join(dir, 'index.db'), { readOnly: true })
    try {
      count = Number(db.prepare('SELECT COUNT(*) AS n FROM images').get().n) || 0
      const row = db.prepare('SELECT path FROM images ORDER BY added_at ASC LIMIT 1').get()
      if (row && row.path) cover = String(row.path)
    } finally { db.close() }
  } catch { /* 空库/坏库 */ }
  return { id, name, description, version, count, cover, path: resolve(dir), source }
}

/** 扫描专辑：albumsDir 下一层带 index.db 的子目录。 */
export function scanAlbums(albumsDir) {
  const out = []
  if (!albumsDir || !existsSync(albumsDir)) return out
  let names
  try { names = readdirSync(albumsDir) } catch { return out }
  for (const name of names.sort()) {
    const dir = join(albumsDir, name)
    if (!isAlbumDir(dir)) continue
    out.push(readAlbumMeta(dir, name, 'user'))
  }
  return out
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** 专辑内相对路径 → 绝对路径；越界抛错。 */
export function resolveInAlbum(root, rel) {
  const abs = resolve(root, String(rel || ''))
  if (abs !== resolve(root) && !abs.startsWith(resolve(root) + sep)) {
    throw new Error('路径越出专辑目录: ' + rel)
  }
  return abs
}

/** 关键词分词：空格/逗号/顿号/斜杠分隔，小写去重。 */
export function keywordTokens(query) {
  const raw = String(query || '').trim().toLowerCase()
  if (!raw) return []
  return [...new Set(raw.split(/[\s,，、;；/|]+/).filter(Boolean))]
}

/** 整词全都没命中时的兜底拆词：「生气猫」→ 生气 / 气猫。 */
function biGrams(tokens) {
  const out = []
  for (const t of tokens) {
    if (t.length < 3 || !/[\u4e00-\u9fff]/.test(t)) continue
    for (let i = 0; i + 2 <= t.length; i++) out.push(t.slice(i, i + 2))
  }
  return [...new Set(out)]
}

const rowHay = (row) => (
  (row.tag || '') + ' ' + (row.caption || '') + ' ' + (row.keywords || '') + ' ' + (row.file_name || '')
).toLowerCase()

function pickRandom(rows, n) {
  const copy = rows.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
  }
  return copy.slice(0, n)
}

/**
 * 关键词检索（纯函数，工具/面板/跨专辑合并共用）。
 * 排序：全部关键词命中的优先；否则命中词数最多的一档；同档内随机（反复搜能换一批）。
 */
export function searchImages(rows, query, limit = 8) {
  const tokens = keywordTokens(query)
  if (tokens.length === 0) return { query: '', tokens: [], images: [] }
  const scan = (words) => {
    const hits = []
    for (const row of rows) {
      const hay = rowHay(row)
      let score = 0
      for (const w of words) if (hay.includes(w)) score++
      if (score > 0) hits.push({ row, score })
    }
    return hits
  }
  let hits = scan(tokens)
  if (hits.length === 0) {
    const grams = biGrams(tokens)
    if (grams.length) hits = scan(grams)
  }
  if (hits.length === 0) return { query: tokens.join(' '), tokens, images: [] }
  const best = Math.max(...hits.map((h) => h.score))
  return {
    query: tokens.join(' '),
    tokens,
    images: pickRandom(hits.filter((h) => h.score === best).map((h) => h.row), limit),
  }
}

export class Album {
  constructor(root) {
    this.root = resolve(root)
    const indexPath = join(this.root, 'index.db')
    if (!existsSync(indexPath)) throw new Error('缺少专辑索引: ' + indexPath)
    this.db = new DatabaseSync(indexPath)
  }

  list(opts = {}) {
    const rows = this.db.prepare('SELECT ' + COLS + ' FROM images ORDER BY added_at DESC').all()
    const tags = this.tags()
    let images = rows
    const tag = String(opts.tag || '').trim().toLowerCase()
    if (tag) images = images.filter((m) => String(m.tag || '').toLowerCase() === tag)
    const q = String(opts.q || '').trim().toLowerCase()
    if (q) {
      const tokens = keywordTokens(q)
      images = images.filter((m) => tokens.some((t) => rowHay(m).includes(t)))
    }
    return { images, tags, total: rows.length }
  }

  tags() {
    return this.db.prepare('SELECT tag, COUNT(*) AS n FROM images GROUP BY tag ORDER BY n DESC, tag ASC')
      .all().map((r) => ({ tag: String(r.tag || ''), count: Number(r.n) || 0 }))
  }

  get(rel) {
    return this.db.prepare('SELECT ' + COLS + ' FROM images WHERE path = ?').get(String(rel || '')) || null
  }

  findBySha(hash) {
    if (!hash) return null
    return this.db.prepare('SELECT ' + COLS + ' FROM images WHERE sha256 = ? LIMIT 1').get(String(hash)) || null
  }

  has(rel) {
    return !!this.db.prepare('SELECT 1 AS x FROM images WHERE path = ?').get(String(rel || ''))
  }

  insert(row) {
    this.db.prepare('INSERT INTO images (path, tag, file_name, caption, keywords, source, sha256, bytes, mtime, added_at, used_at, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.path, row.tag, row.file_name, row.caption || '', row.keywords || '', row.source || '',
        row.sha256 || '', Number(row.bytes) || 0, Number(row.mtime) || Date.now(),
        Number(row.added_at) || Date.now(), row.used_at ? Number(row.used_at) : null, Number(row.use_count) || 0)
  }

  update(rel, fields = {}) {
    const row = this.get(rel)
    if (!row) throw new Error('未知图片: ' + rel)
    const tag = fields.tag != null ? safeTag(fields.tag) : row.tag
    const caption = fields.caption != null ? String(fields.caption).trim().slice(0, 200) : row.caption
    const keywords = fields.keywords != null ? String(fields.keywords).trim().slice(0, 200) : row.keywords
    this.db.prepare('UPDATE images SET tag = ?, caption = ?, keywords = ? WHERE path = ?')
      .run(tag, caption, keywords, rel)
    return { ...row, tag, caption, keywords }
  }

  remove(rel) {
    const row = this.get(rel)
    if (!row) throw new Error('未知图片: ' + rel)
    this.db.prepare('DELETE FROM images WHERE path = ?').run(rel)
    try { rmSync(resolveInAlbum(this.root, rel), { force: true }) } catch { /* 文件已不在 */ }
    return row
  }

  removeTag(tag) {
    const t = safeTag(tag)
    const n = this.db.prepare('DELETE FROM images WHERE tag = ?').run(t).changes
    rmSync(join(this.root, 'images', t), { recursive: true, force: true })
    return Number(n) || 0
  }

  touch(rel, at = Date.now()) {
    const row = this.get(rel)
    if (!row) return null
    this.db.prepare('UPDATE images SET used_at = ?, use_count = COALESCE(use_count, 0) + 1 WHERE path = ?').run(at, rel)
    return this.get(rel)
  }

  close() {
    try { this.db.close() } catch { /* 已关闭 */ }
  }
}

/** 落盘一张图：写文件 + 插索引。同名冲突自动加后缀。 */
export function writeImage(album, { buf, ext, tag, caption, keywords, source, hash, name }) {
  const dirTag = safeTag(tag) || 'unsorted'
  const rel = uniqueRel(album, dirTag, ext, name)
  const abs = resolveInAlbum(album.root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  // 先写临时文件再改名：中途失败不会留下半张图（索引只在写成功后插）
  const tmp = abs + '.part'
  writeFileSync(tmp, buf)
  renameSync(tmp, abs)
  album.insert({
    path: rel, tag: dirTag, file_name: basename(rel), caption, keywords, source,
    sha256: hash, bytes: buf.byteLength, mtime: Date.now(), added_at: Date.now(),
  })
  return rel
}

function uniqueRel(album, tag, ext, name) {
  const base = String(name || '').trim().replace(/[^\w.\-\u4e00-\u9fff]/g, '_').slice(0, 60)
  const stem = base && base.toLowerCase().endsWith(ext.toLowerCase())
    ? base.slice(0, -ext.length)
    : (base ? base.replace(/\.[^.]*$/, '') : '')
  let candidate = 'images/' + tag + '/' + (stem || (Date.now() + '_' + Math.floor(Math.random() * 1e4))) + ext
  let i = 1
  while (album.has(candidate) || existsSync(resolveInAlbum(album.root, candidate))) {
    candidate = 'images/' + tag + '/' + (stem || 'img') + '-' + (++i) + ext
  }
  return candidate
}
