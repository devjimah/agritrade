# Starts the local dev MongoDB replica set (user-space, port 27018).
# Safe to re-run: exits quietly if it is already up. Run after every reboot,
# or wire it into a scheduled task. See README "MongoDB must be a replica set".
$ErrorActionPreference = "Stop"

$port = 27018
$mongod = "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe"
$dataDir = "$env:USERPROFILE\.agritrade-mongo\data"
$logDir = "$env:USERPROFILE\.agritrade-mongo\log"

if ((Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  Write-Host "Dev MongoDB already running on port $port."
  exit 0
}

New-Item -ItemType Directory -Force $dataDir | Out-Null
New-Item -ItemType Directory -Force $logDir | Out-Null

Start-Process -FilePath $mongod -WindowStyle Hidden -ArgumentList @(
  "--replSet", "rs0",
  "--port", "$port",
  "--dbpath", $dataDir,
  "--logpath", "$logDir\mongod.log",
  "--logappend",
  "--bind_ip", "127.0.0.1"
)

Start-Sleep -Seconds 3
if ((Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  Write-Host "Dev MongoDB replica set started on port $port."
} else {
  Write-Error "mongod did not come up — check $logDir\mongod.log"
}
