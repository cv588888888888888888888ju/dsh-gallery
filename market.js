/**
 * dsh-gallery 市场纯逻辑：ZIP 读写、目录/清单规范化、旧格式适配。
 * 语义见 INTERFACE.md §9。不依赖 DSH，可单测。
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeTag } from './store.js'

// ---- 极简 ZIP（store 无压缩）----
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** [{name, data}] → 未压缩 ZIP Buffer */
export function zipStore(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(0, 8)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(f.data.length, 18)
    lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    parts.push(lh, nameBuf, f.data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(f.data.length, 20)
    ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + f.data.length
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, eocd])
}

/** 未压缩 ZIP Buffer → Map<name, Buffer>；含压缩条目直接报错（本插件只写 store ZIP） */
export function unzipStore(buf) {
  const out = new Map()
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let pos = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP 中央目录损坏')
    const method = buf.readUInt16LE(pos + 10)
    const compSize = buf.readUInt32LE(pos + 20)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    if (method !== 0) throw new Error('ZIP 含压缩条目(仅支持未压缩): ' + name)
    out.set(name, Buffer.from(buf.subarray(dataStart, dataStart + compSize)))
    pos += 46 + nameLen + extraLen + commentLen
  }
  return out
}

export function packSlug(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** 目录 JSON → 条目数组（数组或 {packs:[]} 都接受），过滤掉没有拿包地址的条目。 */
export function normalizeDirectory(raw) {
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.packs) ? raw.packs : null)
  if (!list) throw new Error('目录不是数组或 { packs: [] }')
  return list.filter((e) => e && (e.manifestUrl || e.archiveUrl))
}

/** 逐图清单 → 规范化条目（单条非法只跳过并记 warning）。语义见 INTERFACE.md §9.2。 */
export function normalizeRemoteManifest(raw, fallbackId, sourceUrl, limits = {}) {
  const exts = limits.imageExts || ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  const maxItems = limits.maxItems || 500
  const items = Array.isArray(raw && raw.memes) ? raw.memes
    : (Array.isArray(raw && raw.images) ? raw.images : [])
  if (items.length === 0) throw new Error('清单缺少 memes 数组或为空')
  if (items.length > maxItems) throw new Error('清单超过 ' + maxItems + ' 条,请拆分成多个包')
  const id = packSlug(raw.id) || packSlug(fallbackId)
    || ('remote-' + createHash('sha1').update(String(sourceUrl || '')).digest('hex').slice(0, 8))
  const warnings = []
  const seen = new Set()
  const out = []
  for (const it of items) {
    const url = String((it && it.url) || '').trim()
    if (!/^https?:\/\//i.test(url)) { warnings.push('跳过非 http(s) 链接: ' + url.slice(0, 60)); continue }
    const tag = safeTag(it.tag) || 'unsorted'
    let fileName = String(it.file || '').trim().split(/[\\/]/).pop().trim()
    let ext = fileName.includes('.') ? ('.' + fileName.split('.').pop().toLowerCase()) : ''
    if (!exts.includes(ext)) {
      const m = /\.(jpe?g|png|gif|webp)(?:\?|#|$)/i.exec(url)
      ext = m ? '.' + (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()) : '.webp'
      fileName = fileName ? fileName.replace(/\.[^.]*$/, '') + ext : ''
    }
    if (!fileName) fileName = createHash('sha1').update(url).digest('hex').slice(0, 12) + ext
    if (seen.has(tag + '/' + fileName)) fileName = createHash('sha1').update(url).digest('hex').slice(0, 8) + '-' + fileName
    seen.add(tag + '/' + fileName)
    out.push({
      url, tag, fileName,
      rel: 'images/' + tag + '/' + fileName,
      caption: String((it && it.caption) || '').trim().slice(0, 200),
      keywords: String((it && it.keywords) || '').trim().slice(0, 200),
    })
  }
  if (out.length === 0) throw new Error('清单没有有效条目(检查 url/tag 字段)')
  return {
    id,
    name: String(raw.name || id).trim().slice(0, 60) || id,
    description: String(raw.description || '').trim().slice(0, 200),
    version: String(raw.version || '').trim().slice(0, 40),
    items: out,
    warnings,
  }
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS images (
  path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT,
  source TEXT, sha256 TEXT, bytes INTEGER, mtime REAL, added_at REAL, used_at REAL, use_count INTEGER DEFAULT 0)`

/**
 * 包格式适配：语义见 INTERFACE.md §9.3。
 * 旧格式（dsh-meme 的 `memes` 表 + `memes/` 目录）转换成原生布局。
 * @returns {{entries: Map<string,Buffer>, converted: boolean, from: string, count: number}}
 */
export function convertLegacyEntries(entries, tmpDir) {
  if (!entries.get('index.db')) throw new Error('ZIP 里没有 index.db,不是有效的专辑包')
  const srcDb = join(tmpDir, 'inspect.db')
  writeFileSync(srcDb, entries.get('index.db'))
  const db = new DatabaseSync(srcDb)
  let tables = []
  let rows = []
  try {
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name))
    const layout = tables.includes('images') ? 'images' : (tables.includes('memes') ? 'memes' : null)
    if (!layout) throw new Error('index.db 里没有 images / memes 表')
    if (layout === 'images') return { entries, converted: false, from: 'images', count: entries.size }
    rows = db.prepare('SELECT path, tag, file_name, caption, keywords, mtime FROM memes').all()
  } finally { db.close() }

  const outDb = join(tmpDir, 'converted.db')
  const nd = new DatabaseSync(outDb)
  try {
    nd.exec(SCHEMA)
    const ins = nd.prepare('INSERT OR REPLACE INTO images (path, tag, file_name, caption, keywords, source, sha256, bytes, mtime, added_at, used_at, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const r of rows) {
      const rel = String(r.path || '').replace(/^memes\//, 'images/')
      if (!rel.startsWith('images/')) continue
      const bytes = entries.get('memes/' + rel.slice(7)) || entries.get(rel) || entries.get(String(r.path || ''))
      ins.run(rel, safeTag(r.tag) || 'unsorted', String(r.file_name || rel.split('/').pop()), String(r.caption || ''),
        String(r.keywords || ''), 'import', bytes ? createHash('sha256').update(bytes).digest('hex') : '',
        bytes ? bytes.byteLength : 0, Number(r.mtime) || Date.now(), Number(r.mtime) || Date.now(), null, 0)
    }
  } finally { nd.close() }

  const out = new Map()
  for (const [name, data] of entries) {
    if (name === 'index.db') { out.set('index.db', readFileSync(outDb)); continue }
    if (name.startsWith('memes/')) { out.set('images/' + name.slice(6), data); continue }
    out.set(name, data)
  }
  return { entries: out, converted: true, from: 'memes', count: rows.length }
}
