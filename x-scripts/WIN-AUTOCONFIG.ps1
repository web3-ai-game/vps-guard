# ============================================================
# BLUE TEAM — Windows 全自動防護配置腳本
# 用法: 在 PowerShell (管理員) 中執行
# ============================================================

$ErrorActionPreference = "Continue"
$VPS = "167.71.13.130"
$PORT = "3001"
$API = "http://${VPS}:${PORT}"

Write-Host "🛡 BLUE TEAM Win 端自動配置開始..." -ForegroundColor Cyan

# ── 1. 啟用防火牆 ──
Write-Host "`n[1/6] 檢查防火牆..." -ForegroundColor Yellow
$profiles = Get-NetFirewallProfile
foreach ($p in $profiles) {
    if (-not $p.Enabled) {
        Set-NetFirewallProfile -Name $p.Name -Enabled True
        Write-Host "  ✅ 已啟用 $($p.Name) 防火牆" -ForegroundColor Green
    } else {
        Write-Host "  ✅ $($p.Name) 防火牆已啟用" -ForegroundColor Green
    }
}

# ── 2. 確認 Windows Defender ──
Write-Host "`n[2/6] 檢查 Defender..." -ForegroundColor Yellow
try {
    $defender = Get-MpComputerStatus
    if ($defender.RealTimeProtectionEnabled) {
        Write-Host "  ✅ 即時防護已啟用" -ForegroundColor Green
    } else {
        Set-MpPreference -DisableRealtimeMonitoring $false
        Write-Host "  ✅ 已啟用即時防護" -ForegroundColor Green
    }
    Write-Host "  📅 病毒碼更新: $($defender.AntivirusSignatureLastUpdated)" -ForegroundColor Gray
} catch {
    Write-Host "  ⚠ Defender 檢查失敗: $_" -ForegroundColor Red
}

# ── 3. 阻擋可疑入站連線 ──
Write-Host "`n[3/6] 加固防火牆規則..." -ForegroundColor Yellow
$ruleName = "BlueTeam-BlockSuspicious"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Block -Protocol TCP -LocalPort 135,139,445,3389 -Profile Public
    Write-Host "  ✅ 已封鎖公共網路高風險端口 (135,139,445,3389)" -ForegroundColor Green
} else {
    Write-Host "  ✅ 防護規則已存在" -ForegroundColor Green
}

# ── 4. 掃描網路連線 ──
Write-Host "`n[4/6] 掃描可疑連線..." -ForegroundColor Yellow
$suspicious = Get-NetTCPConnection -State Established | Where-Object {
    $_.RemoteAddress -notlike "127.*" -and
    $_.RemoteAddress -notlike "::1" -and
    $_.RemoteAddress -notlike "0.0.0.0"
}
$suspCount = ($suspicious | Measure-Object).Count
Write-Host "  📡 活躍外部連線: $suspCount" -ForegroundColor $(if ($suspCount -gt 20) {"Red"} else {"Green"})

# ── 5. Clone 項目 (如果不存在) ──
Write-Host "`n[5/6] 檢查項目..." -ForegroundColor Yellow
$projectDir = "$env:USERPROFILE\Documents\BLUE_TEAM"
if (-not (Test-Path $projectDir)) {
    Write-Host "  📥 Cloning BLUE_TEAM..." -ForegroundColor Yellow
    git clone https://github.com/web3-ai-game/BLUE_TEAM.git $projectDir
    Write-Host "  ✅ 項目已 Clone 到 $projectDir" -ForegroundColor Green
} else {
    Write-Host "  ✅ 項目已存在: $projectDir" -ForegroundColor Green
    Set-Location $projectDir
    git pull origin main 2>$null
    Write-Host "  ✅ 已拉取最新代碼" -ForegroundColor Green
}

# ── 6. 心跳回報 + 狀態對齊 ──
Write-Host "`n[6/6] 發送狀態到 VPS..." -ForegroundColor Yellow
$fwEnabled = (Get-NetFirewallProfile -Profile Domain).Enabled
$defEnabled = $false
try { $defEnabled = (Get-MpComputerStatus).RealTimeProtectionEnabled } catch {}
$conns = (Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Measure-Object).Count
$ports = (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count

$body = @{
    os = "win"
    firewall = $fwEnabled
    defender = $defEnabled
    hostname = $env:COMPUTERNAME
    connections = $conns
    openPorts = $ports
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$API/api/heartbeat" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
    Write-Host "  ✅ 狀態已回報 VPS" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ VPS 回報失敗: $_" -ForegroundColor Red
}

# ── 完成 ──
Write-Host "`n🛡 BLUE TEAM Win 端配置完成！" -ForegroundColor Cyan
Write-Host "📊 防火牆: ✅ | Defender: $(if($defEnabled){'✅'}else{'❌'}) | 連線: $conns | 端口: $ports" -ForegroundColor White
Write-Host "🌐 面板: http://${VPS}:${PORT}  PIN: 684861" -ForegroundColor Gray

# ── 持續心跳 (每30秒) ──
Write-Host "`n💓 啟動持續心跳 (每30秒)... 按 Ctrl+C 停止`n" -ForegroundColor Yellow

while ($true) {
    try {
        $fwNow = (Get-NetFirewallProfile -Profile Domain).Enabled
        $defNow = $false; try { $defNow = (Get-MpComputerStatus).RealTimeProtectionEnabled } catch {}
        $connsNow = (Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Measure-Object).Count
        $portsNow = (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count

        $hb = @{
            os = "win"
            firewall = $fwNow
            defender = $defNow
            hostname = $env:COMPUTERNAME
            connections = $connsNow
            openPorts = $portsNow
        } | ConvertTo-Json

        Invoke-RestMethod -Uri "$API/api/heartbeat" -Method POST -ContentType "application/json" -Body $hb -TimeoutSec 10 | Out-Null
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 💓 FW:$(if($fwNow){'✅'}else{'❌'}) DEF:$(if($defNow){'✅'}else{'❌'}) CONN:$connsNow PORT:$portsNow" -ForegroundColor DarkGray
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠ 心跳失敗" -ForegroundColor Red
    }
    Start-Sleep -Seconds 30
}
