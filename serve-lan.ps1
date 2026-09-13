# Starts the app so it is reachable from other devices (e.g. a phone) on the LAN.
#
#   .\serve-lan.ps1              # production build (default, no HMR websocket)
#   .\serve-lan.ps1 -Dev         # Vite dev server + HMR (also LAN bound)
#
# Both Laravel (8000) and Vite (5173) bind to 0.0.0.0, so the LAN IP printed
# below works from any device on the same network.

param(
    [switch]$Dev
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Detect the primary LAN IPv4 address (skips virtual adapters like WSL/Hyper-V).
$ip = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
    } |
    Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Hyper-V' } |
    Select-Object -First 1 -ExpandProperty IPAddress

if (-not $ip) {
    Write-Error 'Could not detect a LAN IPv4 address. Connect to Wi-Fi/Ethernet and retry.'
}

Write-Host "LAN address: http://${ip}:8000" -ForegroundColor Cyan

# Point APP_URL at the LAN IP so rendered asset/callback URLs are reachable
# from the phone rather than resolving to 127.0.0.1.
$envFile = Join-Path $root '.env'
$lines = Get-Content $envFile
$lines = $lines -replace '^APP_URL=.*', "APP_URL=http://${ip}:8000"
$lines = $lines -replace '^FRONTEND_URL=.*', "FRONTEND_URL=http://${ip}:8000"
$lines | Set-Content $envFile

php artisan config:clear | Out-Null

if ($Dev) {
    # Frontend dev server (HMR) + Laravel, both bound to all interfaces.
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', "npm run dev:host" -WorkingDirectory $root
    Write-Host 'Vite dev server starting on 0.0.0.0:5173' -ForegroundColor Green
} else {
    # Production build so no Vite/HMR connection is required from the phone.
    Write-Host 'Building frontend assets...' -ForegroundColor Yellow
    npm run build
}

Write-Host "Open http://${ip}:8000 on your phone (same Wi-Fi)." -ForegroundColor Cyan
npm run serve:host
