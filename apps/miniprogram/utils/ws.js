// utils/ws.js — 位置共享 WebSocket 封装。
// 连接 {baseUrl}/ws/location?token=，监听 partner_location_update/stopped/expired。
// 不可用（连接失败）时由调用方降级为轮询，本模块只负责连接与回调。

function toWsUrl(baseUrl, token) {
  const ws = String(baseUrl || '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  return ws.replace(/\/+$/, '') + '/ws/location?token=' + encodeURIComponent(token)
}

// 返回 { close }。回调：onEvent(event, data)、onOpen()、onClose()、onError()。
function connectLocationWs(opts) {
  const url = toWsUrl(opts.baseUrl, opts.token)
  let closedByUser = false
  let task = null

  try {
    task = wx.connectSocket({ url })
  } catch (e) {
    if (opts.onError) opts.onError(e)
    return { close() {} }
  }

  task.onOpen(() => { if (opts.onOpen) opts.onOpen() })
  task.onMessage((res) => {
    try {
      const msg = JSON.parse(res.data)
      if (msg && msg.event && opts.onEvent) opts.onEvent(msg.event, msg.data)
    } catch (e) {
      // 忽略无法解析的消息
    }
  })
  task.onError((e) => { if (opts.onError) opts.onError(e) })
  task.onClose(() => { if (!closedByUser && opts.onClose) opts.onClose() })

  return {
    close() {
      closedByUser = true
      try { task.close({}) } catch (e) { /* 忽略 */ }
    }
  }
}

module.exports = { connectLocationWs, toWsUrl }
