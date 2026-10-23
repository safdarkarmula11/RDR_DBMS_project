# NimbusHost restore (Windows PowerShell).
# Restores a backup made by backup.ps1. The backup contains CREATE DATABASE,
# so the existing database of the same name is replaced.
#
# Usage:   .\scripts\restore.ps1 -File ..\backups\nimbushost_20261021_103000.sql
# WARNING: this overwrites the current data in the database.

param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$User = "root"
)

if (-not (Test-Path $File)) {
  Write-Error "File not found: $File"
  exit 1
}
if (-not (Get-Command mysql -ErrorAction SilentlyContinue)) {
  Write-Error "mysql was not found. Add C:\Program Files\MySQL\MySQL Server 8.0\bin to your PATH."
  exit 1
}

$answer = Read-Host "This replaces the current database with the backup. Type YES to continue"
if ($answer -ne "YES") {
  Write-Host "Cancelled."
  exit 0
}

# PowerShell has no "<" redirection, so let cmd.exe feed the file to mysql
$full = (Resolve-Path $File).Path
cmd /c "mysql -u $User -p < `"$full`""

if ($LASTEXITCODE -ne 0) {
  Write-Error "Restore failed (exit code $LASTEXITCODE)."
  exit $LASTEXITCODE
}
Write-Host "Restore finished. Run: node scripts/integrityTests.js to verify the database."
