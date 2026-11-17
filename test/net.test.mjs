/** 市场出网（可选代理）单测。语义见 INTERFACE.md §9.5。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { makeFetcher, resolveProxyUrl } from '../net.js'

const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)))
const close = (server) => new Promise((ok) => {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
  server.close(() => ok())
})

test('resolveProxyUrl：显式配置优先，其次环境变量，非法一律当直连', () => {
  assert.equal(resolveProxyUrl('http://127.0.0.1:7897', {}), 'http://127.0.0.1:7897')
  assert.equal(resolveProxyUrl('', { HTTPS_PROXY: 'http://p:1' }), 'http://p:1')
  assert.equal(resolveProxyUrl('', { https_proxy: 'http://p:2' }), 'http://p:2')
  assert.equal(resolveProxyUrl('', { HTTP_PROXY: 'http://p:3' }), 'http://p:3')
  assert.equal(resolveProxyUrl('', {}), '')
  assert.equal(resolveProxyUrl('socks5://127.0.0.1:1080', {}), '')
  assert.equal(resolveProxyUrl('', { HTTPS_PROXY: 'not-a-url' }), '')
})

test('没有代理时：原样交给全局 fetch（不改行为）', async () => {
  const prev = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200 } }
  try {
    const f = makeFetcher(() => '')
    const init = { method: 'POST', headers: { a: 'b' } }
    const res = await f('https://example.test/x', init)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], 'https://example.test/x')
    assert.equal(calls[0][1], init)
  } finally { globalThis.fetch = prev }
})

test('有代理时：http 目标走绝对形式请求，响应包装成 fetch 兼容对象', async () => {
  const seen = []
  const proxy = http.createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host })
    res.writeHead(200, { 'content-type': 'application/json', 'x-test': 'yes' })
    res.end(JSON.stringify({ via: 'proxy', url: req.url }))
  })
  const port = await listen(proxy)
  try {
    const f = makeFetcher(() => 'http://127.0.0.1:' + port)
    const res = await f('http://example.test/a.json?q=1', { timeoutMs: 3000 })
    assert.equal(res.ok, true)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json')
    assert.equal(res.headers.get('x-test'), 'yes')
    const body = await res.json()
    assert.equal(body.via, 'proxy')
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, 'http://example.test/a.json?q=1') // 绝对形式
    assert.equal(seen[0].host, 'example.test')
    // body 也能被当作流读（市场里用 for await 读进度）
    let size = 0
    for await (const chunk of res.body) size += chunk.length
    assert.equal(size > 0, true)
  } finally { await close(proxy) }
})

test('有代理时：https 目标先 CONNECT，代理拒绝则给出明确错误', async () => {
  let connectSeen = ''
  const proxy = http.createServer()
  proxy.on('connect', (req, socket) => {
    connectSeen = req.url
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    socket.destroy()
  })
  const port = await listen(proxy)
  try {
    const f = makeFetcher(() => 'http://127.0.0.1:' + port)
    await assert.rejects(() => f('https://example.test/x', { timeoutMs: 3000 }), /CONNECT 失败: HTTP 502/)
    assert.equal(connectSeen, 'example.test:443')
  } finally { await close(proxy) }
})

test('有代理时：代理不响应 ⇒ 按超时失败（不会永久挂住）', async () => {
  // 收下连接但不回应 CONNECT；必须挂 data/end 监听，否则服务端 socket 不会被回收，close() 会一直等
  const proxy = net.createServer((sock) => {
    sock.on('data', () => { /* 收到请求，永不回应 */ })
    sock.on('end', () => sock.destroy())
    sock.on('error', () => {})
  })
  const port = await listen(proxy)
  try {
    const f = makeFetcher(() => 'http://127.0.0.1:' + port)
    const t0 = Date.now()
    await assert.rejects(() => f('https://example.test/x', { timeoutMs: 300 }), /超时/)
    assert.equal(Date.now() - t0 < 3000, true)
  } finally { await close(proxy) }
})

test('有代理时：支持重定向跟随', async () => {
  const hits = []
  const proxy = http.createServer((req, res) => {
    hits.push(req.url)
    if (req.url.endsWith('/start')) {
      res.writeHead(302, { location: 'http://example.test/final' })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('done')
  })
  const port = await listen(proxy)
  try {
    const f = makeFetcher(() => 'http://127.0.0.1:' + port)
    const res = await f('http://example.test/start', { timeoutMs: 3000 })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'done')
    assert.deepEqual(hits, ['http://example.test/start', 'http://example.test/final'])
  } finally { await close(proxy) }
})
