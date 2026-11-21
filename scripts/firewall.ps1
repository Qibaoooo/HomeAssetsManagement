# Opens the server port for devices on the local network. Needs an elevated (Run as administrator) PowerShell.
#   .\scripts\firewall.ps1            # port 8787
#   .\scripts\firewall.ps1 -Port 9000

param([int]$Port = 8787)

$ErrorActionPreference = 'Stop'
if (Get-NetFirewallRule -DisplayName 'HomeAssets' -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName 'HomeAssets'
}
New-NetFirewallRule -DisplayName 'HomeAssets' -Direction Inbound -Protocol TCP -LocalPort $Port `
  -Action Allow -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Inbound TCP $Port allowed from the local subnet on Private networks."
