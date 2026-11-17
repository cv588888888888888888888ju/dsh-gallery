/**
 * host 半边集成测试：用假 cordis ctx 真跑 apply()，直接调工具、直接打 HTTP handler。
 * 语义见 INTERFACE.md §5/§6/§7。只测机制，不钉数值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ensureAlbum, sha256 } from '../store.js'
import { unzipStore, zipStore } from '../market.js'

// 单测必须与操作员的网络环境隔离：市场用例用桩 fetch 打假 URL，
// 一旦进程里带着 HTTPS_PROXY，net.js 会走 CONNECT 隧道而不打桩（实测 18 项红）。
// 语义见 net.js 顶部与 INTERFACE.md §9.5；这里只做隔离，不改生产行为。
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete process.env[k]

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')

function makeCtx({ attachments } = {}) {
  const tools = new Map()
  const routes = []
  const taps = []
  const ctx = {
    tools: { register: (def) => { tools.set(def.name, def) } },
    webServer: {
      host: '127.0.0.1',
      port: 3080,
      register: (route) => { routes.push(route); return () => {} },
      tapIndex: (fn) => { taps.push(fn); return () => {} },
    },
    effect: (fn) => fn(),
    get: (name) => (name === 'attachments' ? attachments : undefined),
  }
  return { ctx, tools, routes, taps }
}

function fakeReq(url, { method = 'GET', headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = headers
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return req
}

function fakeRes() {
  const res = { status: 0, headers: null, chunks: [], ended: false }
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {} }
  res.end = (data) => { res.ended = true; if (data !== undefined) res.chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data))) }
  res.body = () => Buffer.concat(res.chunks)
  res.text = () => res.body().toString('utf8')
  res.json = () => JSON.parse(res.text())
  return res
}

const routeOf = (routes, path) => routes.find((r) => r.path === path)
const call = (handler, req, res) => Promise.resolve().then(() => handler(req, res)).then(() => res)

/** 每个用例一套独立的 home + 插件实例。 */
async function boot(config = {}, attachments) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-gallery-home-'))
  process.env.DSH_GALLERY_HOME = home
  const mod = await import('../index.js')
  const { ctx, tools, routes, taps } = makeCtx({ attachments })
  mod.apply(ctx, config)
  const albumsDir = join(home, '.dsh', 'gallery-packs')
  return { home, albumsDir, tools, routes, taps, albumsDirNow: () => albumsDir, api: routeOf(routes, '/dsh-gallery-api'), images: routeOf(routes, '/dsh-gallery') }
}

test('apply：注册两个工具 + 两条路由 + 小图 CSS，并建出收件箱专辑', async () => {
  const b = await boot()
  assert.deepEqual([...b.tools.keys()].sort(), ['save_image', 'send_image'])
  assert.ok(b.api && b.api.kind === 'exact')
  assert.ok(b.images && b.images.kind === 'prefix')
  assert.equal(b.taps.length, 1)
  assert.equal(existsSync(join(b.albumsDirNow(), 'inbox', 'index.db')), true)
})

test('save_image：本地文件收藏 → 落盘入索引；同一张图再去重', async () => {
  const b = await boot()
  const src = join(b.home, 'shot.png')
  writeFileSync(src, PNG)

  const first = await b.tools.get('save_image').execute({ file: src, tag: '风景', caption: '海边日落', keywords: '海 日落' }, {})
  assert.equal(first.ok, true)
  assert.equal(first.deduped, false)
  assert.match(first.rel, /^images\/风景\//)
  assert.equal(existsSync(join(b.albumsDirNow(), 'inbox', first.rel)), true)
  assert.match(first.markdown, /^!\[海边日落\]\(http:\/\/.+\/dsh-gallery\/inbox\/images\//)

  const again = await b.tools.get('save_image').execute({ file: src }, {})
  assert.equal(again.ok, true)
  assert.equal(again.deduped, true)
  assert.equal(again.rel, first.rel)
})

test('save_image：不支持的格式 / 超限 / 文件不存在 ⇒ ok:false 且不落盘', async () => {
  const b = await boot({ maxImageBytes: 8 })
  const bad = join(b.home, 'a.txt')
  writeFileSync(bad, 'not an image')
  assert.equal((await b.tools.get('save_image').execute({ file: bad }, {})).ok, false)

  const big = join(b.home, 'big.png')
  writeFileSync(big, Buffer.concat([PNG, Buffer.alloc(64)]))
  const tooBig = await b.tools.get('save_image').execute({ file: big }, {})
  assert.equal(tooBig.ok, false)
  assert.match(tooBig.message, /超限|失败/)

  assert.equal((await b.tools.get('save_image').execute({ file: join(b.home, 'nope.png') }, {})).ok, false)

  // 索引里应该还是空的
  const listed = await call(b.api.handler, fakeReq('/dsh-gallery-api', { headers: { host: '127.0.0.1:3080' } }), fakeRes())
  assert.equal(listed.json().images.length, 0)
})

test('save_image：对话附件来源（默认取最近一张用户图）', async () => {
  const ref = { attachmentId: 'att-1', mediaType: 'image/png', name: 'pasted.png' }
  const ref2 = { attachmentId: 'att-2', mediaType: 'image/png', name: 'pasted2.png' }
  const attachments = {
    // 两张不同内容的图，避免被去重挡住
    readImage: async (r) => ({ ref: r, data: r.attachmentId === 'att-1' ? PNG : Buffer.concat([PNG, Buffer.from([3])]) }),
  }
  const b = await boot({}, attachments)
  const exec = { agent: { inbox: { nextTurn: [{ role: 'user', content: [{ type: 'image', attachment: ref }] }] } } }
  const out = await b.tools.get('save_image').execute({ caption: '从对话收藏' }, exec)
  assert.equal(out.ok, true)
  assert.equal(out.tag, '从对话收藏') // 没给 tag ⇒ 从 caption 推断

  // 不给 caption/keywords 时用兜底分类
  const exec2 = { agent: { inbox: { nextTurn: [{ role: 'user', content: [{ type: 'image', attachment: ref2 }] }] } } }
  const bare = await b.tools.get('save_image').execute({ attachmentId: 'att-2' }, exec2)
  assert.equal(bare.ok, true)
  assert.equal(bare.tag, 'unsorted')

  const out2 = await b.tools.get('save_image').execute({ attachmentId: 'missing' }, exec)
  assert.equal(out2.ok, false)
})

test('send_image：关键词命中给出候选与可直接发的 markdown；未命中明确失败', async () => {
  const b = await boot()
  const src = join(b.home, 'cat.png')
  writeFileSync(src, PNG)
  await b.tools.get('save_image').execute({ file: src, tag: '动物', caption: '窗台上的猫', keywords: '猫 窗台' }, {})

  const hit = await b.tools.get('send_image').execute({ query: '猫' }, {})
  assert.equal(hit.ok, true)
  assert.equal(hit.candidates.length, 1)
  assert.match(hit.candidates[0].markdown, /^!\[窗台上的猫\]\(http:\/\//)
  assert.ok(hit.message.includes(hit.candidates[0].markdown))

  const miss = await b.tools.get('send_image').execute({ query: '完全不存在' }, {})
  assert.equal(miss.ok, false)

  const random = await b.tools.get('send_image').execute({}, {})
  assert.equal(random.ok, true)
  assert.equal(random.mode, 'random')
})

test('send_image：pick 记账 + 关闭全部专辑后拒绝发图', async () => {
  const b = await boot()
  const src = join(b.home, 'x.png')
  writeFileSync(src, PNG)
  const saved = await b.tools.get('save_image').execute({ file: src, tag: 't', caption: '图' }, {})
  await b.tools.get('send_image').execute({ pick: saved.rel }, {})
  const listed = await call(b.api.handler, fakeReq('/dsh-gallery-api', { headers: { host: '127.0.0.1:3080' } }), fakeRes())
  assert.equal(listed.json().images[0].path, saved.rel)

  await call(b.api.handler, fakeReq('/dsh-gallery-api', {
    method: 'POST', headers: { host: '127.0.0.1:3080' }, body: JSON.stringify({ op: 'setAlbumEnabled', albumId: 'inbox', enabled: false }),
  }), fakeRes())
  const denied = await b.tools.get('send_image').execute({}, {})
  assert.equal(denied.ok, false)
})

test('图片路由：白名单放行 / 未收录 404 / 越界 404', async () => {
  const b = await boot()
  const src = join(b.home, 'p.png')
  writeFileSync(src, PNG)
  const saved = await b.tools.get('save_image').execute({ file: src, tag: 't', caption: 'c' }, {})
  const urlPath = '/dsh-gallery/inbox/' + saved.rel

  const ok = await call(b.images.handler, fakeReq(urlPath, { headers: { host: '127.0.0.1:3080' } }), fakeRes())
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['Content-Type'], 'image/png')
  assert.equal(ok.body().equals(PNG), true)

  const miss = await call(b.images.handler, fakeReq('/dsh-gallery/inbox/images/t/nope.png'), fakeRes())
  assert.equal(miss.status, 404)

  const escape = await call(b.images.handler, fakeReq('/dsh-gallery/inbox/images/t/../../../index.db'), fakeRes())
  assert.equal(escape.status, 404)
})

test('图片路由：分类含中文时，浏览器发来的百分号编码路径要能命中（回归）', async () => {
  const b = await boot()
  const src = join(b.home, 'zh.png')
  writeFileSync(src, PNG)
  const saved = await b.tools.get('save_image').execute({ file: src, tag: '风景', caption: '海边' }, {})
  assert.match(saved.rel, /^images\/风景\//)

  // 模拟浏览器：把 API 返回的 URL 编码后再请求（真实请求行就是这个形态）
  const reqPath = new URL(saved.url).pathname
  assert.notEqual(reqPath, saved.url.replace('http://127.0.0.1:3080', '')) // 确认确实被编码了
  const res = await call(b.images.handler, fakeReq(reqPath, { headers: { host: '127.0.0.1:3080' } }), fakeRes())
  assert.equal(res.status, 200)
  assert.equal(res.body().equals(PNG), true)
})

test('管理 API：GET 列表带绝对 URL（用请求 Host 生成，而不是写死 127.0.0.1）', async () => {
  const b = await boot()
  const src = join(b.home, 'q.png')
  writeFileSync(src, PNG)
  await b.tools.get('save_image').execute({ file: src, tag: 't', caption: 'c' }, {})

  const res = await call(b.api.handler, fakeReq('/dsh-gallery-api', { headers: { host: '192.168.1.9:3080' } }), fakeRes())
  const body = res.json()
  assert.equal(body.ok, true)
  assert.equal(body.albumId, 'inbox')
  assert.equal(body.images[0].url.startsWith('http://192.168.1.9:3080/dsh-gallery/inbox/'), true)
  assert.equal(body.albums[0].enabled, true)

  // 之后 save_image 生成的 markdown 也用同一个 origin
  const src2 = join(b.home, 'q2.png')
  writeFileSync(src2, Buffer.concat([PNG, Buffer.from([7])]))
  const saved2 = await b.tools.get('save_image').execute({ file: src2, caption: 'c2' }, {})
  assert.equal(saved2.markdown.includes('http://192.168.1.9:3080/dsh-gallery/'), true)
})

test('管理 API：upload / update / delete / deleteTag / createAlbum / setAlbum / deleteAlbum', async () => {
  const b = await boot()
  const h = { host: '127.0.0.1:3080' }
  const post = (body, headers = h) => call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers, body: JSON.stringify(body) }), fakeRes())

  const up = await post({ op: 'upload', fileName: 'a.png', dataBase64: PNG.toString('base64'), tag: '风景', caption: '山' })
  assert.equal(up.json().ok, true)
  const rel = up.json().rel
  assert.ok(rel)

  const upd = await post({ op: 'update', path: rel, caption: '雪山' })
  assert.equal(upd.json().images.find((i) => i.path === rel).caption, '雪山')

  const created = await post({ op: 'createAlbum', id: 'travel', name: '旅行' })
  assert.equal(created.json().ok, true)
  assert.equal(created.json().albumId, 'travel')

  const back = await post({ op: 'setAlbum', albumId: 'inbox' })
  assert.equal(back.json().albumId, 'inbox')

  const del = await post({ op: 'delete', path: rel })
  assert.equal(del.json().images.length, 0)

  await post({ op: 'setAlbum', albumId: 'travel' })
  await post({ op: 'upload', fileName: 'b.png', dataBase64: Buffer.concat([PNG, Buffer.from([1])]).toString('base64'), tag: 'gone', caption: 'x' })
  const dt = await post({ op: 'deleteTag', tag: 'gone' })
  assert.equal(dt.json().deleted, 1)

  const rm = await post({ op: 'deleteAlbum', albumId: 'travel' })
  assert.equal(rm.json().ok, true)
  assert.equal(rm.json().albums.some((a) => a.id === 'travel'), false)

  // 最后一个专辑不许删
  const last = await post({ op: 'deleteAlbum', albumId: 'inbox' })
  assert.equal(last.json().ok, false)
})

test('管理 API：跨站 Origin 被拒；同源放行', async () => {
  const b = await boot()
  const body = JSON.stringify({ op: 'list' })
  const bad = await call(b.api.handler, fakeReq('/dsh-gallery-api', {
    method: 'POST', headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' }, body,
  }), fakeRes())
  assert.equal(bad.status, 403)
  const good = await call(b.api.handler, fakeReq('/dsh-gallery-api', {
    method: 'POST', headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }, body,
  }), fakeRes())
  assert.equal(good.status, 200)
})

test('多专辑：模型可一次搜多个打开的专辑', async () => {
  const b = await boot()
  const h = { host: '127.0.0.1:3080' }
  const post = (body) => call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers: h, body: JSON.stringify(body) }), fakeRes())
  await post({ op: 'createAlbum', id: 'travel', name: '旅行' })
  await post({ op: 'upload', fileName: 'b.png', dataBase64: Buffer.concat([PNG, Buffer.from([2])]).toString('base64'), tag: '海', caption: '海边' })
  await post({ op: 'setAlbum', albumId: 'inbox' })
  const both = await b.tools.get('send_image').execute({ query: '海边' }, {})
  assert.equal(both.ok, true)
  assert.equal(both.candidates[0].albumId, 'travel')
  assert.equal(both.candidates[0].url.includes('/dsh-gallery/travel/'), true)
})

// ---- 市场（语义见 INTERFACE.md §9）----

/** 把 globalThis.fetch 换成按前缀匹配的桩；返回 restore。 */
function stubFetch(routes) {
  const prev = globalThis.fetch
  globalThis.fetch = async (url) => {
    const key = Object.keys(routes).find((k) => String(url).startsWith(k))
    if (!key) throw new Error('no stub for ' + url)
    const r = routes[key]
    const body = r.body || Buffer.alloc(0)
    return {
      ok: !r.status || r.status < 400,
      status: r.status || 200,
      headers: { get: (h) => (String(h).toLowerCase() === 'content-length' ? String(body.length) : null) },
      body: (async function* () { yield body })(),
      arrayBuffer: async () => body,
      json: async () => r.json,
      text: async () => r.text || JSON.stringify(r.json ?? {}),
    }
  }
  return () => { globalThis.fetch = prev }
}

const h3080 = { host: '127.0.0.1:3080' }

/** 造一个 dsh-meme 旧格式（memes 表 + memes/ 目录）的 ZIP。 */
function legacyPackZip() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gallery-legacy-'))
  const db = new DatabaseSync(join(dir, 'index.db'))
  db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
  db.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('memes/happy/ok.jpg', 'happy', 'ok.jpg', '好耶', '好耶 ok', Date.now(), Date.now())
  db.close()
  return zipStore([
    { name: 'index.db', data: readFileSync(join(dir, 'index.db')) },
    { name: 'manifest.json', data: Buffer.from(JSON.stringify({ id: 'legacy', name: '旧格式包' })) },
    { name: 'memes/happy/ok.jpg', data: PNG },
  ])
}

test('市场：旧格式 ZIP 在市场安装路径上被转换并可用（端到端）', async () => {
  const b = await boot()
  const packZip = legacyPackZip()
  const restore = stubFetch({
    'https://stub/pack.zip': { body: packZip },
    'https://stub/catalog.json': { json: { packs: [{ id: 'legacy', name: '旧格式包', archiveUrl: 'https://stub/pack.zip', sha256: sha256(packZip), count: 1 }] } },
  })
  try {
    const post = (body) => call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers: h3080, body: JSON.stringify(body) }), fakeRes())

    // 目录（先把目录源指到桩上，避免打真实网络）
    assert.equal((await post({ op: 'setRemoteDirUrl', remoteDirUrl: 'https://stub/catalog.json' })).json().ok, true)
    const dir = await post({ op: 'remoteDir' })
    assert.equal(dir.json().remoteDir[0].archiveUrl, 'https://stub/pack.zip')

    // 安装（任务制）
    const started = await post({ op: 'installRemoteArchive', archiveUrl: 'https://stub/pack.zip', sha256: sha256(packZip), packId: 'legacy', name: '旧格式包' })
    assert.equal(started.json().ok, true)
    const jobId = started.json().id
    let job = started.json()
    for (let i = 0; i < 200 && job.state === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 10))
      job = (await post({ op: 'remoteJobStatus', jobId })).json()
    }
    assert.equal(job.state, 'done', job.message)

    // 装完即切过去 + 自动打开开关
    const listed = (await call(b.api.handler, fakeReq('/dsh-gallery-api', { headers: h3080 }), fakeRes())).json()
    const hit = listed.albums.find((a) => a.id === 'legacy')
    assert.ok(hit, '专辑应已安装')
    assert.equal(hit.count, 1)
    assert.equal(hit.enabled, true)
    assert.equal(listed.albumId, 'legacy')

    // 旧布局的图现在能从路由取到（目录已从 memes/ 转成 images/）
    const img = await call(b.images.handler, fakeReq('/dsh-gallery/legacy/images/happy/ok.jpg', { headers: h3080 }), fakeRes())
    assert.equal(img.status, 200)
    assert.equal(img.body().equals(PNG), true)

    // 订阅记录已写入
    assert.equal(listed.remoteSubs.some((s) => s.id === 'legacy'), true)
  } finally { restore() }
})

test('市场：SHA-256 不匹配时拒绝安装', async () => {
  const b = await boot()
  const packZip = legacyPackZip()
  const restore = stubFetch({ 'https://stub/pack.zip': { body: packZip } })
  try {
    const post = (body) => call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers: h3080, body: JSON.stringify(body) }), fakeRes())
    const started = await post({ op: 'installRemoteArchive', archiveUrl: 'https://stub/pack.zip', sha256: '0'.repeat(64), packId: 'legacy' })
    const jobId = started.json().id
    let job = started.json()
    for (let i = 0; i < 200 && job.state === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 10))
      job = (await post({ op: 'remoteJobStatus', jobId })).json()
    }
    assert.equal(job.state, 'error')
    assert.match(job.message, /SHA-256/)
    const listed = (await call(b.api.handler, fakeReq('/dsh-gallery-api', { headers: h3080 }), fakeRes())).json()
    assert.equal(listed.albums.some((a) => a.id === 'legacy'), false)
  } finally { restore() }
})

test('市场：导入本地 ZIP（旧格式）走同一条转换路径', async () => {
  const b = await boot()
  const packZip = legacyPackZip()
  const res = await call(b.api.handler, fakeReq('/dsh-gallery-api', {
    method: 'POST', headers: h3080,
    body: JSON.stringify({ op: 'importAlbum', dataBase64: packZip.toString('base64'), albumId: 'legacy' }),
  }), fakeRes())
  const body = res.json()
  assert.equal(body.ok, true)
  assert.match(body.message, /转换/)
  assert.equal(body.albumId, 'legacy')
  assert.equal(body.images.length, 1)
  assert.equal(body.images[0].path, 'images/happy/ok.jpg')
})

test('市场：导出 ZIP 能被 unzipStore 读回，且不含侧车', async () => {
  const b = await boot()
  const src = join(b.home, 'e.png')
  writeFileSync(src, PNG)
  await b.tools.get('save_image').execute({ file: src, tag: 't', caption: 'c' }, {})
  const route = b.routes.find((r) => r.path === '/dsh-gallery-export')
  assert.ok(route, '导出路由应注册')
  const res = await call(route.handler, fakeReq('/dsh-gallery-export?albumId=inbox'), fakeRes())
  assert.equal(res.status, 200)
  assert.equal(res.headers['Content-Type'], 'application/zip')
  const entries = unzipStore(res.body())
  assert.equal(entries.has('index.db'), true)
  assert.equal(entries.has('manifest.json'), true)
  assert.equal([...entries.keys()].some((k) => k.startsWith('images/')), true)
  assert.equal(entries.has('.dsh-remote.json'), false)
})

test('市场：目录源可改为自定义并持久；非法地址被拒', async () => {
  const b = await boot()
  const post = (body) => call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers: h3080, body: JSON.stringify(body) }), fakeRes())
  const bad = await post({ op: 'setRemoteDirUrl', remoteDirUrl: 'not-a-url' })
  assert.equal(bad.json().ok, false)
  const ok = await post({ op: 'setRemoteDirUrl', remoteDirUrl: 'https://mine.example/catalog.json' })
  assert.equal(ok.json().remoteDirUrl, 'https://mine.example/catalog.json')
  const reset = await post({ op: 'setRemoteDirUrl', remoteDirUrl: '' })
  // 空串 = 恢复内置默认：配置位是空字符串，生效源列表是数组（口径见 INTERFACE.md §9.4）
  assert.equal(reset.json().remoteDirUrl, '')
  assert.equal(Array.isArray(reset.json().remoteSources), true)
  // payload 里也保持同一口径（客户端用它回填输入框）
  const listed = (await call(b.api.handler, fakeReq('/dsh-gallery-api', { headers: h3080 }), fakeRes())).json()
  assert.equal(listed.remoteDirUrl, '')
  assert.equal(Array.isArray(listed.remoteSources), true)
  assert.equal(Array.isArray(listed.remoteSubs), true)
})

test('album 参数：收藏进指定专辑', async () => {
  const b = await boot()
  const h = { host: '127.0.0.1:3080' }
  await call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers: h, body: JSON.stringify({ op: 'createAlbum', id: 'travel', name: '旅行' }) }), fakeRes())
  await call(b.api.handler, fakeReq('/dsh-gallery-api', { method: 'POST', headers: h, body: JSON.stringify({ op: 'setAlbum', albumId: 'inbox' }) }), fakeRes())
  const src = join(b.home, 't.png')
  writeFileSync(src, PNG)
  const out = await b.tools.get('save_image').execute({ file: src, album: 'travel', caption: 'c' }, {})
  assert.equal(out.ok, true)
  assert.equal(existsSync(join(b.albumsDirNow(), 'travel', out.rel)), true)
  assert.equal(existsSync(join(b.albumsDirNow(), 'inbox', out.rel)), false)
})
