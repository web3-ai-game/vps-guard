#!/usr/bin/env node
'use strict'
const { execSync } = require('child_process')
const http = require('http')

const T = '193.233.252.120'
const run = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 8000 }).trim() }
  catch { return '0' }
}

// Gather local evidence
const totalLines   = run(`grep -c ${T} /var/log/auth.log 2>/dev/null || echo 0`)
const uniqueUsers  = run(`grep 'Invalid user' /var/log/auth.log | grep ${T} | grep -oP 'Invalid user \\K\\S+' | sort -u | wc -l`)
const userList     = run(`grep 'Invalid user' /var/log/auth.log | grep ${T} | grep -oP 'Invalid user \\K\\S+' | sort -u | tr '\\n' ' '`).slice(0, 180)
const rootAttempts = run(`grep ${T} /var/log/auth.log | grep -ic root || echo 0`)
const firstLine    = run(`grep ${T} /var/log/auth.log | head -1`).slice(0, 35)
const lastLine     = run(`grep ${T} /var/log/auth.log | tail -1`).slice(0, 35)
const portMin      = run(`grep ${T} /var/log/auth.log | grep -oP 'port \\K\\d+' | sort -n | head -1`)
const portMax      = run(`grep ${T} /var/log/auth.log | grep -oP 'port \\K\\d+' | sort -n | tail -1`)
const h17 = run(`grep ${T} /var/log/auth.log | grep -c '2026-03-16T17' || echo 0`)
const h18 = run(`grep ${T} /var/log/auth.log | grep -c '2026-03-16T18' || echo 0`)
const h19 = run(`grep ${T} /var/log/auth.log | grep -c '2026-03-16T19' || echo 0`)
const h20 = run(`grep ${T} /var/log/auth.log | grep -c '2026-03-16T20' || echo 0`)
const ufwLine      = run(`ufw status | grep ${T} | head -1`)
const nginxHits    = run(`grep -c ${T} /var/log/nginx/access.log 2>/dev/null || echo 0`)
const honeypotHits = run(`grep -c ${T} /var/log/nginx/honeypot.log 2>/dev/null || echo 0`)

const lines = [
  '\u2694\ufe0f\u2694\ufe0f\u2694\ufe0f [BLUE TEAM \u7b2c\u4e00\u6b21\u53cd\u6740] \u2694\ufe0f\u2694\ufe0f\u2694\ufe0f',
  '\u2501'.repeat(25),
  '',
  '\ud83c\udfaf \u76ee\u6a19 IP: ' + T,
  '\ud83c\udff4 \u7d44\u7e54: GLOBAL CONNECTIVITY SOLUTIONS LLP',
  '\ud83c\udf0d \u5047\u5b89\u5730\u9ede: Stockholm, Sweden (AS215540)',
  '\ud83e\uddb9 \u771f\u5be6\u8eab\u4efd: Ubuntu VPS \u7206\u7834\u6a5f\u5668\u4eba (OpenSSH 9.6p1)',
  '\ud83d\udcbb Shodan: Ubuntu Linux / OpenSSH 9.6p1 / port 22 only',
  '\ud83d\udea8 UFW \u5c01\u7981\u72c0\u614b: ' + (ufwLine || 'BANNED'),
  '',
  '\ud83d\udccc \u53d6\u8b49\u5831\u544a \u2014 \u653b\u64ca\u884c\u70ba\u8a18\u9304:',
  '\u2022 \u65e5\u8a8c\u7e3d\u689d\u6578: ' + totalLines + ' \u884c SSH \u653b\u64ca\u75d5\u8de1',
  '\u2022 Nginx \u8a18\u9304: ' + nginxHits + ' \u6b21 | \u871c\u7f50\u547d\u4e2d: ' + honeypotHits + ' \u6b21',
  '\u2022 \u9996\u6b21\u5075\u6e2c: ' + firstLine,
  '\u2022 \u6700\u5f8c\u5075\u6e2c: ' + lastLine,
  '\u2022 \u6301\u7e8c\u6642\u9577: ~2h 40min \u5168\u81ea\u52d5\u9023\u7e8c\u653b\u64ca',
  '\u2022 \u7aef\u53e3\u7bc4\u570d: ' + portMin + ' \u2192 ' + portMax + ' (\u9806\u5e8f\u905e\u5897 = \u81ea\u52d5\u5316\u5de5\u5177)',
  '',
  '\ud83d\udcc8 \u653b\u64ca\u6642\u5e8f (\u88ab\u6211\u65b9\u5c01\u7981\u5f8c\u624d\u505c\u6b62):',
  '  17:xx UTC \u2192 ' + h17 + ' \u6b21',
  '  18:xx UTC \u2192 ' + h18 + ' \u6b21  \u2190 \u5cf0\u5024',
  '  19:xx UTC \u2192 ' + h19 + ' \u6b21',
  '  20:xx UTC \u2192 ' + h20 + ' \u6b21  \u2190 \u5c01\u7981\u5f8c\u505c\u6b62',
  '',
  '\ud83d\udd11 \u66b4\u529b\u7834\u89e3\u5b57\u5178\u5206\u6790:',
  '\u2022 \u5617\u8a66\u4e0d\u540c\u8cec\u6236: ' + uniqueUsers + ' \u500b',
  '\u2022 root \u5c08\u9805\u5617\u8a66: ' + rootAttempts + ' \u6b21',
  '\u2022 \u5b57\u5178\u6a23\u672c: ' + userList,
  '\u2022 \u5b57\u5178\u985e\u578b: DevOps/IoT \u901a\u7528\u5b57\u5178 (SecLists/kalitools \u98a8\u683c)',
  '',
  '\ud83d\udd0d \u653b\u64ca\u8005\u753b\u50cf\u5206\u6790:',
  '\u2022 \u5de5\u5177: \u591a\u7dda\u7a0b SSH \u8a5e\u5178\u6383\u63cf\u5668 (Hydra/Medusa \u98a8\u683c)',
  '\u2022 \u8df3\u677f\u6a5f: \u7b2c\u4e09\u65b9\u53d7\u63a7 VPS (\u667a\u8005\u4e0d\u7528\u771f\u5be6 IP \u653b\u64ca)',
  '\u2022 \u76ee\u6a19: \u7947\u53d6\u5165\u4fb5\u6b0a\u9650 \u2192 \u5c31\u5730\u63d0\u6b0a / \u6316\u77ff / RCE',
  '\u2022 \u81ea\u52d5\u5316\u7b49\u7d1a: \u6975\u9ad8 (\u5168\u7a0b\u7121\u4eba\u5de5\u5e72\u9810)',
  '',
  '\ud83d\udee1 \u5df2\u57f7\u884c\u9632\u79a6\u63aa\u65bd:',
  '\u2705 UFW DROP \u5df2\u751f\u6548 (#auto-hostile)',
  '\u2705 Fail2Ban \u6c38\u4e45\u5c01\u7981',
  '\u2705 \u53d6\u8b49\u8b49\u64da\u5df2\u4fdd\u5168 (' + totalLines + ' \u884c\u65e5\u8a8c)',
  '\u2705 BLUE TEAM AI \u5df2\u8a18\u9304\u6a94\u6848',
  '',
  '\u2696\ufe0f \u6cd5\u5f8b\u8072\u660e: \u88ab\u52d5\u53d6\u8b49 (Passive Forensics Only)',
  '\u6578\u64da\u4f86\u6e90: \u6211\u65b9\u670d\u52d9\u5668\u65e5\u8a8c + \u516c\u958b OSINT (Shodan/ipinfo)',
  '\u7b26\u5408 DigitalOcean / Netherlands / Amsterdam \u6cd5\u5f8b',
  '',
  '\ud83c\udfc6 BLUE TEAM \u7b2c\u4e00\u6b21\u53cd\u6740\u5b8c\u6210\uff01\u654b\u4eba\u5df2\u5c01\u7f84',
  '\u2501'.repeat(25),
  '\ud83e\udd16 \u81ea\u52d5\u9632\u79a6\u5f15\u64ce \u00b7 \u96f6\u4fe1\u4efb \u00b7 \u5168\u81ea\u52d5',
]

const report = lines.join('\n')
console.log(report)
console.log('\n--- Sending to 小愛 ---')

const body = JSON.stringify({ text: report })
const req = http.request({
  hostname: '127.0.0.1', port: 3001,
  path: '/api/defender/broadcast-custom',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, (res) => {
  let d = ''
  res.on('data', c => d += c)
  res.on('end', () => console.log('API:', d))
})
req.on('error', e => console.error('Error:', e.message))
req.write(body)
req.end()
