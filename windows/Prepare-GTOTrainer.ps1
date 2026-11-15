param([switch]$InstallShortcutOnly,[switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataRoot = Join-Path $env:LOCALAPPDATA 'Projeto-Poker'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$form = New-Object Windows.Forms.Form
$form.Text = 'Preparar GTO Trainer'; $form.Size = New-Object Drawing.Size(560,250); $form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(20,20); $label.Size = New-Object Drawing.Size(510,135)
$label.Text = "Preparação inicial: verificar Python e Node, preparar PokerKit, compilar a aplicação e criar o atalho. A primeira instalação pode precisar de internet. O banco e seus estudos serão preservados."
$form.Controls.Add($label)
$button = New-Object Windows.Forms.Button
$button.Text = 'Preparar e criar atalho'; $button.Location = New-Object Drawing.Point(20,160); $button.Size = New-Object Drawing.Size(230,32)
$form.Controls.Add($button)
function Invoke-HiddenTask([string]$Executable,[string[]]$Arguments,[string]$WorkingDirectory) {
  $taskLog = Join-Path $dataRoot 'preparation.log'
  # ProcessStartInfo em Windows PowerShell usa quoting Windows, sem interpolação em shell.
  $quoted = $Arguments | ForEach-Object { if ($_ -match '^[A-Za-z0-9_./:=+-]+$') { $_ } else { '"' + ($_ -replace '(\\*)"','$1$1\"' -replace '(\\+)$','$1$1') + '"' } }
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$Executable; $info.Arguments=($quoted -join ' '); $info.WorkingDirectory=$WorkingDirectory
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  $process = [Diagnostics.Process]::Start($info)
  $outputTask=$process.StandardOutput.ReadToEndAsync(); $errorTask=$process.StandardError.ReadToEndAsync()
  $deadline = [DateTime]::UtcNow.AddMinutes(10)
  while(-not $process.WaitForExit(200)) {
    [Windows.Forms.Application]::DoEvents()
    if([DateTime]::UtcNow -gt $deadline) {
      & (Join-Path $env:WINDIR 'System32\taskkill.exe') /PID $process.Id /T /F | Out-Null
      throw 'Etapa excedeu dez minutos e foi interrompida. Confira a conexão e preparation.log.'
    }
  }
  [IO.File]::AppendAllText($taskLog,$outputTask.Result + $errorTask.Result)
  if($process.ExitCode -ne 0) { throw "Etapa falhou (código $($process.ExitCode)). Consulte $taskLog." }
}
function Install-GTOShortcut {
  $icon = Join-Path $PSScriptRoot 'gto-trainer.ico'
  $bitmap = New-Object Drawing.Bitmap(64,64)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([Drawing.Color]::FromArgb(15,23,42))
  $font = New-Object Drawing.Font('Segoe UI Symbol',39,[Drawing.FontStyle]::Bold)
  $brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(52,211,153))
  $graphics.DrawString([char]0x2660,$font,$brush,0,-4)
  $native = $bitmap.GetHicon()
  $drawingIcon = [Drawing.Icon]::FromHandle($native)
  $stream = [IO.File]::Create($icon); $drawingIcon.Save($stream); $stream.Dispose()
  $drawingIcon.Dispose(); $graphics.Dispose(); $font.Dispose(); $brush.Dispose(); $bitmap.Dispose()
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  $shortcut = $shell.CreateShortcut((Join-Path $desktop 'GTO Trainer.lnk'))
  $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $shortcut.Arguments = '"' + (Join-Path $PSScriptRoot 'Launch-GTOTrainer.vbs') + '"'
  $shortcut.WorkingDirectory = $projectRoot; $shortcut.IconLocation = $icon; $shortcut.Description = 'GTO Trainer local - iniciar e abrir no navegador'; $shortcut.WindowStyle=7; $shortcut.Save()
}
if($InstallShortcutOnly) { Install-GTOShortcut; $form.Dispose(); return }
$prepareAction = {
  $button.Enabled=$false; $form.ControlBox=$false
  try {
    $node=(Get-Command node.exe -ErrorAction Stop).Source
    $env:NEXT_TELEMETRY_DISABLED='1'
    $venvPython=Join-Path $projectRoot 'pipeline\hand_history\.venv\Scripts\python.exe'
    if(-not (Test-Path -LiteralPath $venvPython)) {
      $label.Text='Criando ambiente Python local…'; [Windows.Forms.Application]::DoEvents()
      $python=(Get-Command python.exe -ErrorAction Stop).Source
      Invoke-HiddenTask $python @('-m','venv',(Join-Path $projectRoot 'pipeline\hand_history\.venv')) $projectRoot
    }
    $label.Text='Verificando e instalando PokerKit 0.7.7…'; [Windows.Forms.Application]::DoEvents()
    Invoke-HiddenTask $venvPython @('-m','pip','install','--require-hashes','-r',(Join-Path $projectRoot 'pipeline\hand_history\requirements.txt')) $projectRoot
    $appRoot=Join-Path $projectRoot 'app'
    $npmCli=Join-Path ([IO.Path]::GetDirectoryName($node)) 'node_modules\npm\bin\npm-cli.js'
    if(-not (Test-Path -LiteralPath $npmCli)) { throw 'npm ausente. Reinstale Node.js com npm.' }
    if(-not (Test-Path -LiteralPath (Join-Path $appRoot 'node_modules\next'))) {
      $label.Text='Instalando dependências do aplicativo…'; [Windows.Forms.Application]::DoEvents()
      Invoke-HiddenTask $node @($npmCli,'ci') $appRoot
    }
    $label.Text='Compilando a aplicação de produção. Aguarde…'; [Windows.Forms.Application]::DoEvents()
    Invoke-HiddenTask $node @($npmCli,'run','build') $appRoot
    Install-GTOShortcut
    $label.Text='Preparação concluída. Use o ícone GTO Trainer na Área de Trabalho. Feche a janela do iniciador para encerrar o servidor.'
    Invoke-HiddenTask $venvPython @('-c','import sys; from pathlib import Path; sys.path.insert(0,str(Path(sys.argv[1])/"windows")); from launcher_core import installation; installation(Path(sys.argv[1]))',$projectRoot) $projectRoot
    if(-not $PrepareOnly) { [Windows.Forms.MessageBox]::Show('Atalho GTO Trainer criado na Área de Trabalho.','GTO Trainer') | Out-Null }
  } catch {
    $label.Text=$_.Exception.Message
    if($PrepareOnly) { throw }
    [Windows.Forms.MessageBox]::Show($label.Text,'Falha na preparação',0,16) | Out-Null
  } finally { $button.Enabled=$true; $form.ControlBox=$true }
}
$button.Add_Click($prepareAction)
if($PrepareOnly) { try { & $prepareAction; Write-Output 'Preparacao concluida.' } finally { $form.Dispose() }; return }
[void]$form.ShowDialog(); $form.Dispose()
