$ErrorActionPreference = 'Stop'

$projectPath = $PSScriptRoot
$appExecutable = Join-Path $projectPath 'node_modules\electron\dist\electron.exe'
$appEntry = Join-Path $projectPath 'main.js'
$iconPath = Join-Path $projectPath 'assets\logo\logo.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')

if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
    throw "Electron executable was not found at '$appExecutable'. Install the project dependencies before creating a shortcut."
}

if (-not (Test-Path -LiteralPath $appEntry -PathType Leaf)) {
    throw "Application entry point was not found at '$appEntry'."
}

if (-not (Test-Path -LiteralPath $desktopPath -PathType Container)) {
    throw "Desktop folder was not found at '$desktopPath'."
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH-mm-ss'
$uniqueId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$shortcutPath = Join-Path $desktopPath "XBARBER SHOP $timestamp $uniqueId.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $appExecutable
$shortcut.Arguments = '.'
$shortcut.WorkingDirectory = $projectPath
$shortcut.Description = 'Launch XBARBER SHOP'

if (Test-Path -LiteralPath $iconPath -PathType Leaf) {
    $shortcut.IconLocation = $iconPath
}

$shortcut.Save()

Write-Output "Created desktop shortcut: $shortcutPath"
