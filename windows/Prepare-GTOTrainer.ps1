param([switch]$InstallShortcutOnly,[switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataRoot = Join-Path $env:LOCALAPPDATA 'Projeto-Poker'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$form = New-Object Windows.Forms.Form
$form.Text = 'Preparar TreinerLM'; $form.Size = New-Object Drawing.Size(560,250); $form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(20,20); $label.Size = New-Object Drawing.Size(510,135)
$label.Text = "Preparação inicial do TreinerLM (Estúdio Offline MTT): verificar Python e Node, preparar PokerKit, compilar a aplicação e criar o atalho. A primeira instalação pode precisar de internet. O banco e seus estudos serão preservados."
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
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.Color]::FromArgb(5,7,11))
  $gradBrush = New-Object Drawing.Drawing2D.LinearGradientBrush(
    (New-Object Drawing.Point(0,0)),
    (New-Object Drawing.Point(64,64)),
    [Drawing.Color]::FromArgb(220,38,38),
    [Drawing.Color]::FromArgb(37,99,235)
  )
  $pen = New-Object Drawing.Pen($gradBrush, 4)
  $graphics.DrawRectangle($pen, 3, 3, 57, 57)
  $font = New-Object Drawing.Font('Georgia',38,[Drawing.FontStyle]::Bold)
  $brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(248,250,252))
  $graphics.DrawString([char]0x03C0,$font,$brush,11,1)
  $native = $bitmap.GetHicon()
  $drawingIcon = [Drawing.Icon]::FromHandle($native)
  $stream = [IO.File]::Create($icon); $drawingIcon.Save($stream); $stream.Dispose()
  $drawingIcon.Dispose(); $pen.Dispose(); $gradBrush.Dispose(); $graphics.Dispose(); $font.Dispose(); $brush.Dispose(); $bitmap.Dispose()
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  $legacyShortcut = Join-Path $desktop 'GTO Trainer.lnk'
  if (Test-Path -LiteralPath $legacyShortcut) {
    Remove-Item -LiteralPath $legacyShortcut -Force
  }
  $shortcut = $shell.CreateShortcut((Join-Path $desktop 'TreinerLM.lnk'))
  $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $shortcut.Arguments = '"' + (Join-Path $PSScriptRoot 'Launch-GTOTrainer.vbs') + '"'
  $shortcut.WorkingDirectory = $projectRoot; $shortcut.IconLocation = $icon; $shortcut.Description = 'TreinerLM (Estúdio Offline MTT) - iniciar e abrir no navegador'; $shortcut.WindowStyle=7; $shortcut.Save()
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
    $label.Text='Preparação concluída. Use o atalho do TreinerLM na Área de Trabalho. Feche a janela do iniciador para encerrar o servidor.'
    Invoke-HiddenTask $venvPython @('-c','import sys; from pathlib import Path; sys.path.insert(0,str(Path(sys.argv[1])/"windows")); from launcher_core import installation; installation(Path(sys.argv[1]))',$projectRoot) $projectRoot
    if(-not $PrepareOnly) { [Windows.Forms.MessageBox]::Show('Atalho do TreinerLM atualizado na Área de Trabalho.','TreinerLM') | Out-Null }
  } catch {
    $label.Text=$_.Exception.Message
    if($PrepareOnly) { throw }
    [Windows.Forms.MessageBox]::Show($label.Text,'Falha na preparação',0,16) | Out-Null
  } finally { $button.Enabled=$true; $form.ControlBox=$true }
}
$button.Add_Click($prepareAction)
if($PrepareOnly) { try { & $prepareAction; Write-Output 'Preparacao concluida.' } finally { $form.Dispose() }; return }
[void]$form.ShowDialog(); $form.Dispose()
