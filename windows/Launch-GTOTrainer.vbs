Option Explicit
Dim fs, shell, root, pythonw, command
Set fs = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fs.GetParentFolderName(fs.GetParentFolderName(WScript.ScriptFullName))
pythonw = fs.BuildPath(root, "pipeline\hand_history\.venv\Scripts\pythonw.exe")
If Not fs.FileExists(pythonw) Then
  MsgBox "Ambiente Python ausente. Abra Preparar GTO Trainer.vbs na pasta do projeto.", 16, "TreinerLM"
  WScript.Quit 2
End If
command = Chr(34) & pythonw & Chr(34) & " " & Chr(34) & fs.BuildPath(root, "windows\launcher.pyw") & Chr(34)
' pythonw nao cria console; a janela grafica precisa ficar visivel.
shell.Run command, 1, False
