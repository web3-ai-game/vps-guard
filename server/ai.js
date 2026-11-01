const axios = require('axios')

const XAI_BASE = 'https://api.x.ai/v1'

async function analyzeSecurityData(auditData, teammateData) {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY not configured')

  const myDevice = {
    os: auditData.os,
    firewall: auditData.security?.firewallEnabled,
    stealth: auditData.security?.stealthEnabled,
    listenPorts: auditData.listenPorts?.length || 0,
    devices: auditData.devices?.length || 0,
    wifi: auditData.wifi?.authMode,
    dns: auditData.network?.dns,
    score: auditData.score,
    verdict: auditData.verdict,
    findings: auditData.findings?.map(f => `[${f.level}] ${f.title}`),
  }

  const teammate = teammateData ? {
    os: 'Windows 11',
    ip: teammateData.ip || 'unknown',
    firewall: teammateData.firewall,
    defender: teammateData.defender,
    openPorts: teammateData.open_ports,
  } : null

  const prompt = `你是一位藍隊資安專家，請用繁體中文回答。
當前環境是公共 WiFi（賓館/酒店），零信任原則：預設不可信。

我的設備 (macOS ${myDevice.os}):
- 防火牆: ${myDevice.firewall ? '✅ 已啟用' : '❌ 未啟用'}
- 隱身模式: ${myDevice.stealth ? '✅ 已啟用' : '❌ 未啟用'}
- 監聽端口數: ${myDevice.listenPorts}
- LAN 設備數: ${myDevice.devices}
- WiFi 加密: ${myDevice.wifi}
- DNS 服務器: ${myDevice.dns?.join(', ')}
- 安全評分: ${myDevice.score}/100 (${myDevice.verdict})
- 發現項目: ${myDevice.findings?.join('; ')}

${teammate ? `隊友設備 (Windows 11):
- IP: ${teammate.ip}
- 防火牆: ${teammate.firewall || '未知'}
- Windows Defender: ${teammate.defender || '未知'}
- 開放端口: ${teammate.openPorts || '未知'}` : '隊友設備: 尚未連線'}

請提供：
1. **當前最緊迫的 3 個風險**（簡短）
2. **我應立即執行的 3 個操作**
3. **隊友應立即執行的 2 個操作**
4. **本次公共 WiFi 環境的整體安全建議**（2-3 句）

格式要簡潔，用 emoji 標示重要度，不超過 400 字。`

  const resp = await axios.post(
    `${XAI_BASE}/chat/completions`,
    {
      model: 'grok-4-0709',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  )

  return resp.data.choices[0].message.content
}

module.exports = { analyzeSecurityData }
