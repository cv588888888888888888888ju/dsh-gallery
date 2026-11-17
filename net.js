/**
 * 市场出网：可选走本机 HTTP 代理。
 * 语义见 INTERFACE.md §9.5（值见 config.js）。
 *
 * 为什么不用全局 fetch：Node 22 的 fetch（undici）**不认** HTTP_PROXY/HTTPS_PROXY 环境变量，
 * 在直连 GitHub Releases 被限速的网络里，装的包会慢到不可用（实测直连 4KB/s vs 代理 700KB/s）。
 * 这里用 node:net / node:tls / node:http 实现 CONNECT 隧道，零第三方依赖。
 */
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'

/** 取生效的代理地址：显式配置 > 环境变量 > 空（直连）。 */
export function resolveProxyUrl(configured, env = process.env) {
  const v = String(configured || '').trim()
    || String(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || '').trim()
  return /^https?:\/\//i.test(v) ? v : ''
}

function responseLike(status, headers, buffer) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    body: (async function* () { if (buffer.length) yield buffer })(),
    arrayBuffer: async () => buffer,
    text: async () => buffer.toString('utf8'),
    json: async () => JSON.parse(buffer.toString('utf8')),
  }
}

/** 一次带代理的 GET（含重定向跟随）。导出仅为可诊断/可单测。 */
export function proxiedGet(url, proxy, opts) {
  const hop = (target, depth) => new Promise((resolve, reject) => {
    const u = new URL(target)
    const p = new URL(proxy)
    let settled = false
    let timer = null
    const sockets = new Set()
    const onAbort = () => fail(new Error('请求已取消'))
    const cleanup = () => {
      clearTimeout(timer)
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
    }
    // 失败/超时必须把底层 socket 关掉：否则连接泄漏，代理端还挂着（测试里 drain 不掉、真实场景里占 fd）
    const fail = (error) => {
      if (!settled) {
        settled = true
        cleanup()
        for (const s of sockets) { try { s.destroy() } catch { /* 已关闭 */ } }
        sockets.clear()
        reject(error)
      }
    }
    const done = (value) => { if (!settled) { settled = true; cleanup(); sockets.clear(); resolve(value) } }
    timer = setTimeout(() => fail(new Error('请求超时(' + opts.timeoutMs + 'ms)')), opts.timeoutMs)
    if (opts.signal) {
      if (opts.signal.aborted) { fail(new Error('请求已取消')); return }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }
    const collect = (res) => {
      sockets.add(res.socket)
      const headers = {}
      for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '')
      const chunks = []
      let total = 0
      res.on('data', (c) => {
        total += c.length
        if (opts.maxBytes && total > opts.maxBytes) { res.destroy(); fail(new Error('响应超过上限')); return }
        chunks.push(c)
      })
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        const status = res.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(status) && headers.location && depth < (opts.maxRedirects ?? 5)) {
          let next
          try { next = new URL(headers.location, u).href } catch { next = '' }
          if (next) { hop(next, depth + 1).then(done, fail); return }
        }
        done({ status, headers, buffer: body })
      })
      res.on('error', fail)
    }

    if (u.protocol === 'http:') {
      // 明文目标：直接向代理发绝对形式请求
      const req = http.request({
        host: p.hostname, port: Number(p.port) || 80, method: 'GET',
        path: u.href, headers: { host: u.host, accept: '*/*', 'user-agent': 'dsh-gallery' },
      }, collect)
      req.on('socket', (s) => sockets.add(s))
      req.on('error', fail)
      req.end()
      return
    }

    // https 目标：CONNECT 打隧道，再在隧道里做 TLS
    const port = Number(u.port) || 443
    const sock = net.connect({ host: p.hostname, port: Number(p.port) || 80 })
    sockets.add(sock)
    sock.on('error', fail)
    sock.on('close', () => fail(new Error('代理连接被关闭')))
    sock.on('connect', () => sock.write('CONNECT ' + u.hostname + ':' + port + ' HTTP/1.1\r\nHost: ' + u.hostname + ':' + port + '\r\n\r\n'))
    let head = Buffer.alloc(0)
    const onData = (chunk) => {
      head = Buffer.concat([head, chunk])
      const idx = head.indexOf('\r\n\r\n')
      if (idx < 0) {
        if (head.length > 8192) fail(new Error('代理响应头异常'))
        return
      }
      sock.removeListener('data', onData)
      const status = Number((/^HTTP\/1\.[01] (\d+)/.exec(head.subarray(0, idx).toString('latin1')) || [])[1] || 0)
      const rest = head.subarray(idx + 4)
      if (rest.length) sock.unshift(rest)
      if (status !== 200) { fail(new Error('代理 CONNECT 失败: HTTP ' + status)); return }
      const secure = tls.connect({ socket: sock, servername: u.hostname })
      sockets.add(secure)
      secure.on('error', fail)
      secure.on('secureConnect', () => {
        const req = https.request({
          host: u.hostname, port, method: 'GET', path: u.pathname + u.search,
          headers: { host: u.host, accept: '*/*', 'user-agent': 'dsh-gallery' },
          createConnection: () => secure, agent: false,
        }, collect)
        req.on('error', fail)
        req.end()
      })
    }
    sock.on('data', onData)
  })
  return hop(url, 0)
}

/** 判断是不是「连不上代理」这类可回落直连的错误。 */
function looksLikeProxyDown(error) {
  const msg = String((error && error.message) || '')
  const code = String(error && error.code || '')
  return /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|代理连接被关闭|socket hang up|EPIPE/i.test(code + ' ' + msg)
}

/**
 * 造一个 fetch 兼容的出网函数。
 * @param {() => string} getProxyUrl 每次调用现取代理地址（改配置即时生效）
 */
export function makeFetcher(getProxyUrl) {
  return async function netFetch(url, init = {}) {
    const proxy = getProxyUrl()
    if (!proxy) return fetch(url, init)
    const timeoutMs = Number(init.timeoutMs) || 30000
    try {
      const { status, headers, buffer } = await proxiedGet(String(url), proxy, {
        timeoutMs, signal: init.signal, maxBytes: init.maxBytes,
      })
      return responseLike(status, headers, buffer)
    } catch (error) {
      // 代理没开/不可达 ⇒ 回落直连，避免「配了代理反而全都不通」
      if (looksLikeProxyDown(error)) return fetch(url, init)
      throw error
    }
  }
}
