// Minimal Telegram Bot API client. Live mode only.
// Demo mode never constructs a client and never opens a network call.

class TelegramClient {
  constructor(token) {
    this.token = token
    this.options = { username: null }
    this.handlers = {}
    this.offset = 0
    this.running = false
  }

  on(event, fn) {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(fn)
    return this
  }

  emit(event, payload) {
    for (const fn of this.handlers[event] || []) {
      try { fn(payload) } catch (err) { console.error('[telegram]', err.message) }
    }
  }

  async start() {
    if (this.running) return
    this.running = true
    try {
      const me = await this.call('getMe', {})
      this.options.username = me.username || null
    } catch (err) {
      this.emit('polling_error', err)
    }
    this.loop()
  }

  stopPolling() {
    this.running = false
  }

  async loop() {
    while (this.running) {
      try {
        const updates = await this.call('getUpdates', {
          offset: this.offset,
          timeout: 10,
          allowed_updates: ['message'],
        }, 20000)
        for (const update of updates || []) {
          this.offset = update.update_id + 1
          if (update.message) this.emit('message', update.message)
        }
      } catch (err) {
        if (err.name === 'AbortError') continue
        this.emit('polling_error', err)
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }

  sendMessage(chatId, text, opts = {}) {
    return this.call('sendMessage', { chat_id: chatId, text, ...opts })
  }

  editMessageText(text, opts = {}) {
    return this.call('editMessageText', {
      text,
      chat_id: opts.chat_id,
      message_id: opts.message_id,
      parse_mode: opts.parse_mode,
    })
  }

  pinChatMessage(chatId, messageId, opts = {}) {
    return this.call('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: !!opts.disable_notification,
    })
  }

  async call(method, body, timeoutMs = 20000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const data = await response.json()
      if (!data.ok) {
        const err = new Error(data.description || `Telegram ${method} failed`)
        err.code = data.error_code
        throw err
      }
      return data.result
    } finally {
      clearTimeout(timer)
    }
  }
}

function createBot(token) {
  return new TelegramClient(token)
}

module.exports = { TelegramClient, createBot }
