"""
Blue Team Agent - Windows 11
隊友端防護代理，透過 Telegram Bot 接收指令並執行防護操作

安裝依賴:
    pip install python-telegram-bot==13.15

設定:
    修改下方 BOT_TOKEN 和 CHAT_ID 後直接運行
    python blue-team-agent.py
"""

import subprocess
import socket
import platform
import os
import sys
import json
import logging
from datetime import datetime

try:
    from telegram.ext import Updater, MessageHandler, Filters
    from telegram import Bot
except ImportError:
    print("[ERROR] 請先安裝依賴: pip install python-telegram-bot==13.15")
    sys.exit(1)

logging.basicConfig(level=logging.WARNING)

# ─────────────────────────────────────────
# 填入你的 Bot Token 和 Chat ID
BOT_TOKEN = ""   # 從 BotFather 取得，格式: 123456:ABCxxx
CHAT_ID   = ""   # 群組 ID，格式: -1001234567890
# ─────────────────────────────────────────

ALLOWED_CMDS = {"!status", "!protect", "!netstat", "!ipconfig", "!dnsflush"}


def run_ps(cmd: str, timeout: int = 15) -> str:
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
            capture_output=True, text=True, timeout=timeout
        )
        return (result.stdout + result.stderr).strip()[:800]
    except Exception as e:
        return f"ERROR: {e}"


def run_cmd(cmd: str, timeout: int = 10) -> str:
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return (result.stdout + result.stderr).strip()[:800]
    except Exception as e:
        return f"ERROR: {e}"


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except:
        return socket.gethostbyname(socket.gethostname())


def cmd_status() -> str:
    ip = get_local_ip()
    hostname = socket.gethostname()
    os_ver = platform.version()

    fw = run_ps("(Get-NetFirewallProfile -Profile Domain,Public,Private | Select-Object Name,Enabled | ConvertTo-Json)")
    try:
        fw_data = json.loads(fw)
        if isinstance(fw_data, list):
            fw_str = ", ".join(f"{p['Name']}:{p['Enabled']}" for p in fw_data)
        else:
            fw_str = str(fw_data.get('Enabled', 'unknown'))
    except:
        fw_str = "unknown"

    wd = run_ps("(Get-MpComputerStatus).RealTimeProtectionEnabled")

    ports = run_cmd("netstat -an | findstr LISTENING | findstr -v 127.0.0.1 | findstr -v ::1")
    port_lines = [l.strip() for l in ports.split('\n') if l.strip()][:6]
    ports_str = "; ".join(port_lines) if port_lines else "none"

    return (
        f"[AGENT] Windows 11 Status Report\n"
        f"HOSTNAME: {hostname}\n"
        f"IP: {ip}\n"
        f"OS: {os_ver[:40]}\n"
        f"FIREWALL: {fw_str}\n"
        f"DEFENDER: {wd.strip()}\n"
        f"OPEN_PORTS: {ports_str}\n"
        f"TIMESTAMP: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )


def cmd_protect() -> str:
    results = []

    r1 = run_ps("Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True")
    results.append(f"Firewall: {'OK' if not r1.startswith('ERROR') else r1[:50]}")

    r2 = run_ps("Set-MpPreference -DisableRealtimeMonitoring $false")
    results.append(f"Defender RTP: {'OK' if not r2.startswith('ERROR') else r2[:50]}")

    r3 = run_ps("Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force")
    results.append(f"Disable SMB1: {'OK' if not r3.startswith('ERROR') else r3[:50]}")

    r4 = run_ps("Disable-NetAdapterBinding -Name '*' -ComponentID ms_lltdio -ErrorAction SilentlyContinue")
    results.append(f"LLTD disabled: OK")

    r5 = run_cmd("ipconfig /flushdns")
    results.append(f"DNS Flush: {'OK' if 'flush' in r5.lower() or 'Successfully' in r5 else r5[:40]}")

    return (
        f"[AGENT] Protection Suite Applied\n"
        f"IP: {get_local_ip()}\n"
        + "\n".join(f"{r}" for r in results) +
        f"\nTIMESTAMP: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )


def cmd_netstat() -> str:
    out = run_cmd("netstat -ano | findstr ESTABLISHED")
    lines = [l.strip() for l in out.split('\n') if l.strip()][:15]
    return f"[AGENT] Active Connections\n" + "\n".join(lines) if lines else "[AGENT] No active connections"


def cmd_ipconfig() -> str:
    out = run_ps("Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,IPAddress | Format-Table -AutoSize | Out-String")
    gw = run_ps("(Get-NetRoute -DestinationPrefix '0.0.0.0/0').NextHop")
    dns = run_ps("(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses -join ', '")
    return (
        f"[AGENT] Network Config\n"
        f"IP: {get_local_ip()}\n"
        f"GATEWAY: {gw.strip()[:40]}\n"
        f"DNS: {dns.strip()[:80]}\n"
        f"INTERFACES:\n{out[:300]}"
    )


def cmd_dnsflush() -> str:
    out = run_cmd("ipconfig /flushdns")
    return f"[AGENT] DNS Flush\n{out[:200]}"


HANDLERS = {
    "!status": cmd_status,
    "!protect": cmd_protect,
    "!netstat": cmd_netstat,
    "!ipconfig": cmd_ipconfig,
    "!dnsflush": cmd_dnsflush,
}


def on_message(update, context):
    if not update.message:
        return
    text = (update.message.text or "").strip()
    chat_id = str(update.message.chat_id)

    if CHAT_ID and chat_id != str(CHAT_ID):
        return

    cmd = text.split()[0].lower() if text else ""
    if cmd not in ALLOWED_CMDS:
        return

    print(f"[CMD] {cmd} from {update.message.from_user.username}")
    try:
        reply = HANDLERS[cmd]()
    except Exception as e:
        reply = f"[AGENT] ERROR executing {cmd}: {e}"

    context.bot.send_message(chat_id=update.message.chat_id, text=reply)


def main():
    if not BOT_TOKEN:
        print("[ERROR] 請在腳本頂部填入 BOT_TOKEN 和 CHAT_ID")
        sys.exit(1)

    print(f"[AGENT] Blue Team Agent 啟動")
    print(f"[AGENT] IP: {get_local_ip()}")
    print(f"[AGENT] 等待指令: {', '.join(ALLOWED_CMDS)}")

    bot = Bot(token=BOT_TOKEN)
    bot.send_message(
        chat_id=CHAT_ID,
        text=f"[AGENT] Windows 11 Agent Online\nIP: {get_local_ip()}\nHost: {socket.gethostname()}"
    )

    updater = Updater(token=BOT_TOKEN, use_context=True)
    dp = updater.dispatcher
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, on_message))
    updater.start_polling(poll_interval=2.0, timeout=10)
    print("[AGENT] 運行中... Ctrl+C 退出")
    updater.idle()


if __name__ == "__main__":
    main()
