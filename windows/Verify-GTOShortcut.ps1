$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$linkPath=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'GTO Trainer.lnk'
if(-not (Test-Path -LiteralPath $linkPath)){throw 'Atalho ausente.'}
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($linkPath)
$bootstrap=Join-Path $PSScriptRoot 'Launch-GTOTrainer.vbs'
$icon=Join-Path $PSScriptRoot 'gto-trainer.ico'
$checks=[ordered]@{
  shortcutExists=$true
  targetIsWindowsScriptHost=([IO.Path]::GetFileName($link.TargetPath) -eq 'wscript.exe')
  bootstrapPathIsAbsolute=($link.Arguments -eq ('"'+$bootstrap+'"'))
  bootstrapExists=(Test-Path -LiteralPath $bootstrap)
  workingDirectoryMatches=($link.WorkingDirectory -eq $projectRoot)
  iconMatchesCheckout=($link.IconLocation -eq ($icon+',0') -or $link.IconLocation -eq $icon)
  iconExists=(Test-Path -LiteralPath $icon)
  actualDoubleClickTest='PENDING_USER_TEST'
}
if($checks.Values -contains $false){throw ($checks|ConvertTo-Json)}
$checks|ConvertTo-Json
