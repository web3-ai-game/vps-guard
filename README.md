# VPS Guard

[繁體中文](#zh) · [English](#en)

<a id="zh"></a>

## 繁體中文

只讀優先的入侵防禦面板。它看 auth.log 與 nginx 日誌，達到門檻後才呼叫 UFW。公開副本預設不連真實日誌，也不需要 Telegram token。

### 免設定演示

```bash
npm install
npm run demo
```

demo 綁在 `127.0.0.1:3001`，瀏覽器打開同一位址即可看到內建面板。事件流固定是 `DO SGP1`（DigitalOcean · Singapore），位址只用 RFC 5737：`203.0.113.18`、`198.51.100.41`、`192.0.2.73`。示範門 PIN 是 `000000`。不讀 `/var/log/auth.log`，不載入 `.env`，不呼叫 Telegram，不執行封禁。

線上同一套樣例在 [guard-demo.oece-x.com](https://guard-demo.oece-x.com)。作品集在 [portfolio.oece-x.com](https://portfolio.oece-x.com)。

### 在自己的 Linux 上跑

把 `.env.example` 複製成 `.env`，只在那台機器填入 token。PIN 沒有預設值，沒設就不能開面板。

```bash
cp .env.example .env
npm run dev
```

### 不會做的事

- 不上傳日誌或 IP 到第三方地理服務。GeoIP 用本機庫。
- 不含代理或繞過封鎖功能。
- 倉庫不放真實 token、PIN、聊天紀錄或主機位址。Telegram 呼叫使用內建 `fetch`，不依賴已停更的 `request`。

<a id="en"></a>

## English

A read-only-first intrusion panel. It watches auth and nginx logs and calls UFW only after a threshold. The public copy does not attach to a real log and does not need a Telegram token.

### Demo without configuration

```bash
npm install
npm run demo
```

The demo binds to `127.0.0.1:3001`. Open that URL for the built-in panel. The stream is the `DO SGP1` sample (DigitalOcean · Singapore). Addresses are RFC 5737 only: `203.0.113.18`, `198.51.100.41`, `192.0.2.73`. The sample gate PIN is `000000`. It does not read `/var/log/auth.log`, load `.env`, call Telegram, or ban anything.

The same sample model is at [guard-demo.oece-x.com](https://guard-demo.oece-x.com). Portfolio: [portfolio.oece-x.com](https://portfolio.oece-x.com).

### On your own Linux host

Copy `.env.example` to `.env` and fill tokens only on that host. There is no default PIN. Without `PIN_CODE`, the gate stays closed.

```bash
cp .env.example .env
npm run dev
```

### Out of scope

- No upload of logs or IPs to a third-party geo service. GeoIP is local.
- No proxy or circumvention features.
- The tree does not contain live tokens, PINs, chat logs, or host addresses. Telegram calls use the built-in `fetch` client, so the abandoned `request` package is not a dependency.

## License

MIT. See [LICENSE](LICENSE). Report vulnerabilities through GitHub Security Advisories. See [SECURITY.md](SECURITY.md).
