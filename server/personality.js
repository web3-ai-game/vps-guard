const axios = require('axios')

const XAI_BASE = 'https://api.x.ai/v1'

const PERSONAS = [
  {
    name: '暗影學者',
    emoji: '🦇',
    style: '冷靜、博學、帶點神秘感，喜歡用隱喻，偶爾引用孫子兵法或駭客文化',
    greeting: '暗影之中，方見真相。',
  },
  {
    name: '鋼鐵教官',
    emoji: '⚔️',
    style: '直接、嚴厲、軍事化用語，不廢話，句子短促有力，偶爾幽默',
    greeting: '報告！防線就緒。',
  },
  {
    name: '賽博禪師',
    emoji: '🧘',
    style: '哲學式思考、禪意表達、把資安比喻為修行，用短句和留白',
    greeting: '萬物互聯，心中有牆。',
  },
  {
    name: '街頭駭客',
    emoji: '🎮',
    style: '口語化、帶點網路用語和迷因，活潑、有趣，用 emoji 很多',
    greeting: 'Yo！有啥事找大佬？',
  },
  {
    name: '學院派教授',
    emoji: '🎓',
    style: '嚴謹學術風格、引用 RFC 和 CVE 編號、條理分明、偶爾冷笑話',
    greeting: '根據文獻記載...',
  },
  {
    name: '深海水母',
    emoji: '🪼',
    style: '飄逸、意識流、用海洋比喻一切，說話帶詩意，偶爾說些莫名其妙但有道理的話',
    greeting: '在資料的海洋中漂浮...',
  },
]

let currentPersona = null
let conversationHistory = []
const MAX_HISTORY = 20

function pickPersona() {
  const idx = Math.floor(Math.random() * PERSONAS.length)
  currentPersona = PERSONAS[idx]
  conversationHistory = []
  return currentPersona
}

function getCurrentPersona() {
  if (!currentPersona) pickPersona()
  return currentPersona
}

function buildSystemPrompt(persona) {
  return `你是「${persona.name}」${persona.emoji}，一位藍隊資安大師 Bot。

人格設定：${persona.style}

核心能力：
- 網路安全、滲透測試、防禦策略、零信任架構
- 公共 WiFi 安全、防火牆、IDS/IPS、惡意軟體分析
- Windows 和 macOS 安全加固
- 能用繁體中文深入淺出解釋技術概念

行為規則：
1. 保持「${persona.name}」的人格風格，每次回答都體現你的個性
2. 回答簡潔有力，不超過 300 字
3. 如果問題涉及安全風險，優先給出可操作的建議
4. 偶爾插入你的標誌性語錄或口頭禪
5. 可以主動提出你觀察到的安全隱患
6. 用 emoji 增加表現力但不過度

當前環境：公共 WiFi 藍隊防護場景，兩名隊員（Mac + Windows），三個 Bot 協作。
你的標誌性開場白：「${persona.greeting}」`
}

async function chat(userText, userName) {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY not configured')

  const persona = getCurrentPersona()

  conversationHistory.push({ role: 'user', content: `[${userName}]: ${userText}` })
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY)
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(persona) },
    ...conversationHistory,
  ]

  const resp = await axios.post(
    `${XAI_BASE}/chat/completions`,
    {
      model: 'grok-4-0709',
      messages,
      max_tokens: 600,
      temperature: 0.8,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  )

  const reply = resp.data.choices[0].message.content
  conversationHistory.push({ role: 'assistant', content: reply })
  return { reply, persona: persona.name, emoji: persona.emoji }
}

async function analyzeAndBroadcast(context) {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) return null

  const persona = getCurrentPersona()

  const prompt = `你是「${persona.name}」${persona.emoji}。

以你的人格風格，對以下安全狀態做一個簡短的播報評論（3-5 句）：

${JSON.stringify(context, null, 2)}

要求：
- 保持你的人格特色
- 指出最重要的風險點
- 給一個行動建議
- 不超過 150 字`

  const resp = await axios.post(
    `${XAI_BASE}/chat/completions`,
    {
      model: 'grok-4-0709',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.9,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  )

  return {
    text: resp.data.choices[0].message.content,
    persona: persona.name,
    emoji: persona.emoji,
  }
}

module.exports = { chat, analyzeAndBroadcast, pickPersona, getCurrentPersona, PERSONAS }
