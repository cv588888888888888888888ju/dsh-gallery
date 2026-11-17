/** 市场纯逻辑单测：ZIP 往返 / 目录与清单规范化 / 旧格式适配。语义见 INTERFACE.md §9。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  convertLegacyEntries, normalizeDirectory, normalizeRemoteManifest, packSlug, unzipStore, zipStore,
} from '../market.js'
import { sha256 } from '../store.js'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')

test('ZIP 往返：未压缩、支持中文名', () => {
  const files = [
    { name: 'index.db', data: Buffer.from('db-bytes') },
    { name: 'images/风景/a.jpg', data: PNG },
  ]
  const zip = zipStore(files)
  const back = unzipStore(zip)
  assert.deepEqual([...back.keys()].sort(), ['images/风景/a.jpg', 'index.db'])
  assert.equal(back.get('index.db').toString(), 'db-bytes')
  assert.equal(back.get('images/风景/a.jpg').equals(PNG), true)
})

test('packSlug：只留 [a-z0-9_-]', () => {
  assert.equal(packSlug('DeepSeek酱 语录!'), 'deepseek')
  assert.equal(packSlug('--x--'), 'x')
  assert.equal(packSlug(''), '')
})

test('normalizeDirectory：两种形状 + 过滤无拿包地址的条目', () => {
  assert.equal(normalizeDirectory([{ id: 'a', archiveUrl: 'u' }]).length, 1)
  assert.equal(normalizeDirectory({ schemaVersion: 1, packs: [{ id: 'a', manifestUrl: 'm' }] }).length, 1)
  assert.equal(normalizeDirectory([{ id: 'a' }, { id: 'b', archiveUrl: 'u' }]).length, 1)
  assert.throws(() => normalizeDirectory({ nope: 1 }))
})

test('normalizeRemoteManifest：规范化 + 跳过非法条目 + 中文分类保留', () => {
  const raw = {
    id: 'Test Pack!!', name: '测试包', version: '1.0',
    memes: [
      { url: 'https://x/a.jpg', tag: '风景', caption: '海边', keywords: '海' },
      { url: 'not-a-url', tag: 'a' },
      { url: 'https://x/b.png', tag: 'happy' },
    ],
  }
  const m = normalizeRemoteManifest(raw, '', 'https://src', { maxItems: 10 })
  assert.equal(m.id, 'testpack')
  assert.equal(m.items.length, 2)
  assert.equal(m.warnings.length, 1)
  assert.match(m.items[0].rel, /^images\/风景\/\w+\.jpg$/)
  assert.match(m.items[1].rel, /^images\/happy\/\w+\.png$/)
  assert.equal(m.items[0].caption, '海边')
})

test('normalizeRemoteManifest：空清单/超条目上限一律拒绝', () => {
  assert.throws(() => normalizeRemoteManifest({ memes: [] }, 'x', 'u', {}))
  assert.throws(() => normalizeRemoteManifest({ memes: [{ url: 'https://x/a.jpg', tag: 'a' }, { url: 'https://x/b.jpg', tag: 'a' }] }, 'x', 'u', { maxItems: 1 }))
})

test('normalizeRemoteManifest：无 tag 落到 unsorted；重名自动区分', () => {
  const m = normalizeRemoteManifest({ memes: [
    { url: 'https://x/1.jpg', tag: '' },
    { url: 'https://x/2.jpg', tag: 'a', file: 'same.jpg' },
    { url: 'https://x/3.jpg', tag: 'a', file: 'same.jpg' },
  ] }, 'p', 'u', {})
  assert.match(m.items[0].rel, /^images\/unsorted\/\w+\.jpg$/)
  assert.notEqual(m.items[1].rel, m.items[2].rel)
})

/** 造一个 dsh-meme 旧格式的包（memes 表 + memes/ 目录）。 */
function legacyZip() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gallery-legacy-'))
  const db = new DatabaseSync(join(dir, 'index.db'))
  db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
  const ins = db.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  ins.run('memes/happy/ok.jpg', 'happy', 'ok.jpg', '好耶', '好耶 ok', 1700000000000, 1700000000000)
  ins.run('memes/猫/mao.jpg', '猫', 'mao.jpg', '猫猫', '猫', 1700000000001, 1700000000001)
  db.close()
  return zipStore([
    { name: 'index.db', data: readFileSync(join(dir, 'index.db')) },
    { name: 'manifest.json', data: Buffer.from(JSON.stringify({ id: 'legacy', name: '旧格式包' })) },
    { name: 'memes/happy/ok.jpg', data: PNG },
    { name: 'memes/猫/mao.jpg', data: Buffer.concat([PNG, Buffer.from([1])]) },
  ])
}

test('旧格式适配：memes 表 + memes/ 目录 → images 布局，且补齐新列', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-gallery-conv-'))
  const entries = unzipStore(legacyZip())
  const out = convertLegacyEntries(entries, tmp)
  assert.equal(out.converted, true)
  assert.equal(out.from, 'memes')
  assert.equal(out.count, 2)

  assert.equal(out.entries.has('images/happy/ok.jpg'), true)
  assert.equal(out.entries.has('images/猫/mao.jpg'), true)
  assert.equal([...out.entries.keys()].some((k) => k.startsWith('memes/')), false)

  const dbPath = join(tmp, 'converted.db')
  writeFileSync(dbPath, out.entries.get('index.db'))
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db.prepare('SELECT * FROM images ORDER BY path').all()
    assert.equal(rows.length, 2)
    assert.equal(rows[0].path, 'images/happy/ok.jpg')
    assert.equal(rows[0].caption, '好耶')
    assert.equal(rows[0].sha256, sha256(PNG))
    assert.equal(rows[0].bytes, PNG.byteLength)
    assert.equal(rows[0].added_at, 1700000000000)
    assert.equal(rows[1].path, 'images/猫/mao.jpg')
    assert.equal(rows[1].tag, '猫')
  } finally { db.close() }
})

test('原生格式包：转换器识别后原样放行，不改一个字节', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-gallery-native-'))
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gallery-natedb-'))
  const db = new DatabaseSync(join(dir, 'index.db'))
  db.exec('CREATE TABLE images (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, source TEXT, sha256 TEXT, bytes INTEGER, mtime REAL, added_at REAL, used_at REAL, use_count INTEGER DEFAULT 0)')
  db.close()
  const zip = zipStore([{ name: 'index.db', data: readFileSync(join(dir, 'index.db')) }, { name: 'images/a/x.png', data: PNG }])
  const entries = unzipStore(zip)
  const out = convertLegacyEntries(entries, tmp)
  assert.equal(out.converted, false)
  assert.equal(out.from, 'images')
  assert.deepEqual([...out.entries.keys()].sort(), [...entries.keys()].sort())
})

test('既不认识 images 也不认识 memes ⇒ 明确拒绝', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-gallery-bad-'))
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gallery-baddb-'))
  const db = new DatabaseSync(join(dir, 'index.db'))
  db.exec('CREATE TABLE nope (a TEXT)')
  db.close()
  const entries = unzipStore(zipStore([{ name: 'index.db', data: readFileSync(join(dir, 'index.db')) }]))
  assert.throws(() => convertLegacyEntries(entries, tmp), /images \/ memes/)
  assert.throws(() => convertLegacyEntries(new Map(), tmp), /index\.db/)
})
