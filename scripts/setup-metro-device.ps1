# Prepare Windows + USB so your phone can load JS from Metro (port 8081).
# Run from project root:  powershell -ExecutionPolicy Bypass -File .\scripts\setup-metro-device.ps1

$ErrorActionPreference = "Continue"

Write-Host "=== Expo Metro device setup ===" -ForegroundColor Cyan

# 1. Firewall (needs Administrator once)
$ruleName = "Expo Metro Bundler 8081"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Adding firewall rule for TCP 8081 (may prompt for Admin)..."
    try {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow | Out-Null
        Write-Host "  Firewall rule added." -ForegroundColor Green
    } catch {
        Write-Host "  Could not add firewall rule. Run PowerShell as Administrator and run:" -ForegroundColor Yellow
        Write-Host "  New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow"
    }
} else {
    Write-Host "  Firewall rule already exists." -ForegroundColor Green
}

# 2. USB port reverse (most reliable; phone uses localhost)
$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb) {
    $devices = & adb devices 2>&1 | Select-String "device$"
    if ($devices) {
        & adb reverse tcp:8081 tcp:8081
        & adb reverse tcp:8097 tcp:8097 2>$null
        Write-Host "  adb reverse: phone localhost:8081 -> PC:8081" -ForegroundColor Green
        Write-Host "  After Metro starts, open the app with bundler URL:" -ForegroundColor Cyan
        Write-Host "    http://127.0.0.1:8081"
        Write-Host "  (Dev menu on phone -> Change bundler URL, or scan QR after setting tunnel/LAN)"
    } else {
        Write-Host "  adb found but no device connected. Plug in USB and enable USB debugging." -ForegroundColor Yellow
    }
} else {
    Write-Host "  adb not in PATH. Install Android platform-tools or use Android Studio SDK." -ForegroundColor Yellow
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "LAN bundler URL (Wi-Fi, VPN OFF on phone):" -ForegroundColor Cyan
Write-Host "  http://${ip}:8081"
Write-Host ""
Write-Host "Checklist:" -ForegroundColor Cyan
Write-Host "  1. Turn OFF VPN on the phone (status bar key icon)"
Write-Host "  2. Phone and PC on the same Wi-Fi (not guest network)"
Write-Host "  3. Run: npx expo start --dev-client --clear"
Write-Host "  4. If LAN fails, use USB + http://127.0.0.1:8081 after adb reverse above"
