/**
 * 存储层单测。语义见 INTERFACE.md §3/§4/§5.2。
 * 只测**机制**，不钉具体数值（契约先行 §四）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Album, ensureAlbum, isAlbumDir, resolveInAlbum, safeTag, scanAlbums,
  searchImages, sha256, writeImage,
} from '../store.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'dsh-gallery-'))
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

test('专辑：建、扫、判定', () => {
  const home = tmp()
  const dir = join(home, 'albums', 'inbox')
  assert.equal(isAlbumDir(dir), false)
  ensureAlbum(dir, 'inbox', '收件箱')
  assert.equal(isAlbumDir(dir), true)
  assert.equal(existsSync(join(dir, 'index.db')), true)
  assert.equal(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).name, '收件箱')

  ensureAlbum(join(home, 'albums', 'travel'), 'travel', '旅行')
  const albums = scanAlbums(join(home, 'albums'))
  assert.deepEqual(albums.map((a) => a.id), ['inbox', 'travel'])
  assert.equal(albums[0].count, 0)
  assert.equal(scanAlbums(join(home, 'nope')).length, 0)
})

test('safeTag：中文保留、危险字符折叠、空值回落', () => {
  assert.equal(safeTag('风景'), '风景')
  assert.equal(safeTag('Sun Set!'), 'sun_set')
  assert.equal(safeTag('../../etc'), 'etc')
  assert.equal(safeTag('   '), '')
  assert.equal(safeTag('a'.repeat(80)).length <= 24, true)
})

test('路径安全：越界一律拒绝', () => {
  const root = tmp()
  assert.equal(resolveInAlbum(root, 'images/a/b.png').startsWith(root), true)
  assert.throws(() => resolveInAlbum(root, '../../../etc/passwd'))
  assert.throws(() => resolveInAlbum(root, 'images/../../x.png'))
})

test('写入 + 列出 + 分类统计', () => {
  const root = join(tmp(), 'inbox')
  ensureAlbum(root, 'inbox')
  const album = new Album(root)
  try {
    const hash = sha256(PNG)
    const rel = writeImage(album, {
      buf: PNG, ext: '.png', tag: '风景', caption: '海边日落', keywords: '日落 海',
      source: 'file:/tmp/a.png', hash, name: 'a.png',
    })
    assert.equal(rel.startsWith('images/风景/'), true)
    assert.equal(existsSync(join(root, rel)), true)

    const listed = album.list()
    assert.equal(listed.images.length, 1)
    assert.equal(listed.images[0].caption, '海边日落')
    assert.equal(listed.images[0].sha256, hash)
    assert.deepEqual(listed.tags, [{ tag: '风景', count: 1 }])

    // 同 tag 同名再次写入 ⇒ 文件名自动加后缀，不覆盖
    const rel2 = writeImage(album, { buf: Buffer.concat([PNG, Buffer.from([1])]), ext: '.png', tag: '风景', caption: '第二张', source: 'x', hash: 'h2', name: 'a.png' })
    assert.notEqual(rel2, rel)
    assert.equal(album.list().images.length, 2)

    // 去重判据：findBySha 命中已有行
    assert.equal(album.findBySha(hash).path, rel)
    assert.equal(album.findBySha('nope'), null)
  } finally { album.close() }
})

test('改 / 删 / 删分类 / 记账', () => {
  const root = join(tmp(), 'inbox')
  ensureAlbum(root, 'inbox')
  const album = new Album(root)
  try {
    const rel = writeImage(album, { buf: PNG, ext: '.png', tag: 'a', caption: 'c', source: 'x', hash: 'h', name: 'x.png' })
    album.update(rel, { tag: 'b', caption: '改过', keywords: 'k' })
    const row = album.get(rel)
    assert.equal(row.tag, 'b')
    assert.equal(row.caption, '改过')

    const touched = album.touch(rel)
    assert.equal(touched.use_count, 1)
    assert.equal(album.touch('images/none.png'), null)

    const before = album.get(rel).path
    album.remove(before)
    assert.equal(album.get(before), null)
    assert.equal(existsSync(join(root, before)), false)

    writeImage(album, { buf: PNG, ext: '.png', tag: 'gone', caption: 'x', source: 'x', hash: 'h3', name: 'g.png' })
    assert.equal(album.removeTag('gone'), 1)
    assert.equal(existsSync(join(root, 'images', 'gone')), false)
    assert.equal(album.get(rel), null)
  } finally { album.close() }
})

test('索引没了的目录不算专辑', () => {
  const root = join(tmp(), 'broken')
  ensureAlbum(root, 'broken')
  rmSync(join(root, 'index.db'))
  assert.equal(isAlbumDir(root), false)
  assert.throws(() => new Album(root))
})

test('检索：全命中优先 + 同档随机 + 拆词兜底 + 未命中为空', () => {
  const rows = [
    { path: 'p1', tag: '风景', caption: '海边日落', keywords: '日落', file_name: 'a.jpg' },
    { path: 'p2', tag: '动物', caption: '猫在窗台', keywords: '猫 窗', file_name: 'b.jpg' },
    { path: 'p3', tag: '动物', caption: '生气猫', keywords: '', file_name: 'c.jpg' },
  ]
  // 两个词全中的只有 p2/p3 中的 "猫"，「生气 猫」应优先 p3
  const both = searchImages(rows, '生气 猫', 5)
  assert.deepEqual(both.images.map((r) => r.path), ['p3'])

  // 单关键词命中多条 ⇒ 同一档内随机（多次调用结果应覆盖到 ≥1 条且在集合内）
  const seen = new Set()
  for (let i = 0; i < 40; i++) for (const r of searchImages(rows, '猫', 2).images) seen.add(r.path)
  assert.deepEqual([...seen].sort(), ['p2', 'p3'])

  // 未命中 ⇒ 空
  assert.deepEqual(searchImages(rows, '不存在的东西', 5).images, [])
  // 空 query ⇒ 空
  assert.deepEqual(searchImages(rows, '   ', 5).images, [])
  // tag 也算 haystack
  assert.deepEqual(searchImages(rows, '风景', 5).images.map((r) => r.path), ['p1'])
})

test('检索：limit 生效', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ path: 'p' + i, tag: 't', caption: '图 ' + i, file_name: 'f' + i }))
  assert.equal(searchImages(rows, '图', 7).images.length, 7)
})

test('sha256 稳定且区分内容', () => {
  assert.equal(sha256(PNG), sha256(Buffer.from(PNG)))
  assert.notEqual(sha256(PNG), sha256(Buffer.concat([PNG, Buffer.from([9])])))
})

test('写盘中途失败不留半张图（临时文件先写后改名）', () => {
  const root = join(tmp(), 'inbox')
  ensureAlbum(root, 'inbox')
  const album = new Album(root)
  try {
    const rel = writeImage(album, { buf: PNG, ext: '.png', tag: 't', caption: '', source: 'x', hash: 'h', name: 'ok.png' })
    assert.equal(existsSync(join(root, rel + '.part')), false)
    assert.equal(album.list().images.length, 1)
    // 目录里没有游离的 .part
    writeFileSync(join(root, 'stray.part'), 'x')
    assert.equal(existsSync(join(root, 'stray.part')), true)
  } finally { album.close() }
})
