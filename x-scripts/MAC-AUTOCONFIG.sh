#!/bin/bash
# ============================================================
# BLUE TEAM — macOS 全自動防護配置腳本
# 用法: chmod +x MAC-AUTOCONFIG.sh && sudo ./MAC-AUTOCONFIG.sh
# ============================================================

VPS="167.71.13.130"
PORT="3001"
API="http://${VPS}:${PORT}"
HOSTNAME=$(hostname)

echo "🛡 BLUE TEAM Mac 端自動配置開始..."

# ── 1. 檢查防火牆 ──
echo -e "\n[1/5] 檢查防火牆..."
FW_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -c "enabled")
if [ "$FW_STATUS" -eq 0 ]; then
    /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on 2>/dev/null
    echo "  ✅ 已啟用防火牆"
else
    echo "  ✅ 防火牆已啟用"
fi

# ── 2. 啟用隱身模式 ──
echo -e "\n[2/5] 啟用隱身模式..."
/usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on 2>/dev/null
echo "  ✅ 隱身模式已啟用 (不回應 ICMP/ping)"

# ── 3. 掃描網路連線 ──
echo -e "\n[3/5] 掃描網路連線..."
CONNS=$(netstat -an 2>/dev/null | grep ESTABLISHED | wc -l | tr -d ' ')
PORTS=$(netstat -an 2>/dev/null | grep LISTEN | wc -l | tr -d ' ')
echo "  📡 活躍連線: $CONNS"
echo "  📡 監聽端口: $PORTS"

# ── 4. 同步項目代碼 ──
echo -e "\n[4/5] 同步項目..."
PROJECT_DIR="$HOME/CascadeProjects/blue-team-ui"
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    git pull origin main 2>/dev/null
    echo "  ✅ 項目已同步"
else
    echo "  ⚠ 項目目錄不存在: $PROJECT_DIR"
fi

# ── 5. 心跳回報 ──
echo -e "\n[5/5] 發送狀態到 VPS..."
FW_BOOL="true"
[ "$FW_STATUS" -eq 0 ] && FW_BOOL="false"

BODY=$(cat <<EOF
{
  "os": "mac",
  "firewall": $FW_BOOL,
  "hostname": "$HOSTNAME",
  "connections": $CONNS,
  "openPorts": $PORTS
}
EOF
)

curl -s -X POST "$API/api/heartbeat" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  --connect-timeout 10 > /dev/null 2>&1 && \
  echo "  ✅ 狀態已回報 VPS" || \
  echo "  ⚠ VPS 回報失敗"

echo -e "\n🛡 Mac 端配置完成！"
echo "📊 防火牆: ✅ | 連線: $CONNS | 端口: $PORTS"
echo "🌐 面板: http://${VPS}:${PORT}  PIN: 684861"

# ── 持續心跳 ──
echo -e "\n💓 啟動持續心跳 (每30秒)... Ctrl+C 停止\n"

while true; do
    CONNS=$(netstat -an 2>/dev/null | grep ESTABLISHED | wc -l | tr -d ' ')
    PORTS=$(netstat -an 2>/dev/null | grep LISTEN | wc -l | tr -d ' ')
    FW_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -c "enabled")
    FW_BOOL="true"
    [ "$FW_STATUS" -eq 0 ] && FW_BOOL="false"

    curl -s -X POST "$API/api/heartbeat" \
      -H "Content-Type: application/json" \
      -d "{\"os\":\"mac\",\"firewall\":$FW_BOOL,\"hostname\":\"$HOSTNAME\",\"connections\":$CONNS,\"openPorts\":$PORTS}" \
      --connect-timeout 10 > /dev/null 2>&1

    echo "[$(date +%H:%M:%S)] 💓 FW:$FW_BOOL CONN:$CONNS PORT:$PORTS"
    sleep 30
done
