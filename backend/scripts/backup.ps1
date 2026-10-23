# NimbusHost backup (Windows PowerShell).
# Creates a consistent logical backup of the database, including tables, data,
# stored procedures, functions, triggers, views and scheduled events.
#
# Usage:   .\scripts\backup.ps1                (from the backend folder)
#          .\scripts\backup.ps1 -User root -Database nimbushost
# You will be asked for the MySQL password.

param(
  [string]$User = "root",
  [string]$Database = "nimbushost",
  [string]$OutDir = (Join-Path $PSScriptRoot "..\..\backups")
)

if (-not (Get-Command mysqldump -ErrorAction SilentlyContinue)) {
  Write-Error "mysqldump was not found. Add C:\Program Files\MySQL\MySQL Server 8.0\bin to your PATH."
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $OutDir "$Database`_$stamp.sql"

# --single-transaction : consistent snapshot without locking InnoDB tables (MVCC)
# --routines --triggers --events : include stored programs, not just tables
# --source-data=2      : write the binary log position as a comment (used for point-in-time recovery)
mysqldump -u $User -p --single-transaction --routines --triggers --events --source-data=2 --databases $Database --result-file="$file"

if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup failed (exit code $LASTEXITCODE)."
  exit $LASTEXITCODE
}
$size = [math]::Round((Get-Item $file).Length / 1MB, 2)
Write-Host "Backup written to $file ($size MB)"
