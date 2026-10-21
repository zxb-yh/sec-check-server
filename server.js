// secCheckServer — 抖音内容安全检测代理（自研模式）
// 容器内用 client_key + client_secret 自己换 access_token，再带 X-Token 调官方 text/antidirt。
// 关键：appid / secret 只存在容器环境变量，绝不进入小程序前端。
const http = require('http')
const https = require('https')
const { URL } = require('url')

const PORT = process.env.PORT || 3000
const APPID = process.env.APPID || ''
const APPSECRET = process.env.APPSECRET || ''
const TOKEN_URL = 'https://developer.toutiao.com/api/apps/v2/token'
const ANTIDIRT_URL = 'https://developer.toutiao.com/api/v2/tags/text/antidirt'

// 简单内存 token 缓存
let tokenCache = { token: '', expireAt: 0 }

function postJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const payload = JSON.stringify(bodyObj)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('bad json: ' + data)) }
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function getAccessToken() {
  const now = Date.now()
  if (tokenCache.token && now < tokenCache.expireAt - 60 * 1000) {
    return tokenCache.token
  }
  if (!APPID || !APPSECRET) throw new Error('missing APPID/APPSECRET env')
  const r = await postJson(TOKEN_URL, {
    appid: APPID,
    secret: APPSECRET,
    grant_type: 'client_credential'
  })
  if (!r || r.err_no !== 0 || !r.data || !r.data.access_token) {
    throw new Error('token fail: ' + JSON.stringify(r))
  }
  tokenCache.token = r.data.access_token
  tokenCache.expireAt = now + (r.data.expires_in || 7200) * 1000
  return tokenCache.token
}

async function checkText(content) {
  const token = await getAccessToken()
  const r = await postJson(ANTIDIRT_URL, {
    tasks: [{ content: content }]
  })
  // 官方返回结构：{ data:[{ code:0, predicts:[{ hit:bool }] }] }
  if (r && Array.isArray(r.data)) {
    const item = r.data[0]
    if (item && Array.isArray(item.predicts)) {
      const hit = item.predicts.some((p) => p && p.hit === true)
      return { isRisk: hit, raw: r }
    }
  }
  // 结构异常（含 401 bad access_token）→ 抛错，交由调用方回退本地词表
  throw new Error('antidirt unexpected: ' + JSON.stringify(r))
}

function send(res, status, obj) {
  const s = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(s)
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    return send(res, 200, { ok: true, msg: 'secCheckServer running' })
  }
  if (req.method === 'POST' && req.url === '/api/text/antidirt') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      try {
        const { content } = JSON.parse(body || '{}')
        if (!content) return send(res, 400, { success: false, errMsg: 'empty content' })
        const r = await checkText(content)
        // 透传官方 antidirt 原始响应，与客户端 parseAntidirt 解析对齐（result.data[].predicts[].hit）
        return send(res, 200, { success: true, result: r.raw })
      } catch (e) {
        // 任何异常（token 失败 / 401 / 网络）→ success:false，客户端回退本地词表
        return send(res, 200, { success: false, errMsg: e.message })
      }
    })
    return
  }
  send(res, 404, { success: false, errMsg: 'not found' })
})

server.listen(PORT, () => console.log('secCheckServer listening on ' + PORT))
