# Security policy

## Reporting

Use GitHub Security Advisories. Do not open a public issue with logs, tokens, PIN values, or host addresses.

## What this tool does

The live mode runs on a host you operate. It can read logs and, after a threshold, ask UFW to deny an address. That is an operational risk. Demo mode does not do it.

## What is not in this repository

- No Telegram bot token or chat id.
- No default PIN. An empty `PIN_CODE` does not open the gate.
- No cloud API token.
- No private host address. Samples use RFC 5737 ranges.

## Demo

`npm run demo` binds to localhost, emits a fixed sample stream, and does not start the defender, watcher, or Telegram clients.
