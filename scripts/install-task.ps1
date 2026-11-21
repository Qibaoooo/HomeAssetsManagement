# Registers a Scheduled Task that starts the Home Assets server at logon and keeps it running.
# Run once from a normal PowerShell window (no admin needed):  .\scripts\install-task.ps1
# Remove with:  Unregister-ScheduledTask -TaskName HomeAssets -Confirm:$false

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$log  = Join-Path $repo 'data\server.log'

New-Item -ItemType Directory -Force -Path (Join-Path $repo 'data') | Out-Null

# cmd wrapper so stdout/stderr land in a log file and the window stays hidden.
$cmd = "/c `"`"$node`" server\dist\index.js >> `"$log`" 2>&1`""
$action   = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $repo
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden

Register-ScheduledTask -TaskName 'HomeAssets' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'HomeAssets'
Write-Host "Task 'HomeAssets' registered and started. Log: $log"
