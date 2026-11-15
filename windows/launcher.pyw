from pathlib import Path
import ctypes
from ctypes import wintypes
import queue
import threading
import tkinter as tk
from tkinter import messagebox
import webbrowser
from launcher_core import Runtime,LaunchError,identity,reopen_existing

def main():
    root_path=Path(__file__).resolve().parent.parent
    kernel=ctypes.WinDLL("kernel32",use_last_error=True)
    kernel.CreateMutexW.restype=wintypes.HANDLE
    kernel.CreateMutexW.argtypes=[ctypes.c_void_p,wintypes.BOOL,wintypes.LPCWSTR]
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    mutex=kernel.CreateMutexW(None,False,"Local\\GTOTrainer-"+identity(root_path))
    already=ctypes.get_last_error()==183
    if not mutex:
        messagebox.showerror("GTO Trainer","Não foi possível criar o controle de instância.");return
    if already:
        url=reopen_existing(root_path)
        if url:webbrowser.open(url)
        else:messagebox.showinfo("GTO Trainer","O GTO Trainer já está aberto ou iniciando. Aguarde a janela existente. Nenhum novo servidor foi iniciado.")
        kernel.CloseHandle(mutex);return
    window=tk.Tk();window.title("GTO Trainer");window.geometry("510x240");window.resizable(False,False)
    icon=root_path/"windows/gto-trainer.ico"
    if icon.exists():window.iconbitmap(str(icon))
    window.configure(bg="#0f172a")
    tk.Label(window,text="♠  GTO Trainer",font=("Segoe UI",21,"bold"),bg="#0f172a",fg="#6ee7b7").pack(pady=(20,10))
    status=tk.StringVar(value="Verificando dependências e iniciando a aplicação local…")
    tk.Label(window,textvariable=status,wraplength=465,bg="#0f172a",fg="#e2e8f0",font=("Segoe UI",10)).pack(pady=5)
    runtime=Runtime(root_path);events=queue.Queue();closing=False;ready=False
    open_button=tk.Button(window,text="Abrir no navegador",state="disabled",command=lambda:webbrowser.open(runtime.url));open_button.pack(pady=8)
    def prepare():
        try:runtime.start();runtime.wait_ready();events.put(("ready",None))
        except Exception as exc:
            runtime.stop();events.put(("error",str(exc) if isinstance(exc,LaunchError) else "Falha local de inicialização. Confira permissões e launcher.log."))
    thread=threading.Thread(target=prepare,daemon=True);thread.start()
    def close():
        nonlocal closing
        if closing:return
        closing=True;status.set("Encerrando o servidor e os processos locais…");open_button.config(state="disabled")
        runtime.cancelled.set()
        def cleanup():
            # Espera start para impedir criação de processo após fechar o Job.
            thread.join(timeout=100);runtime.stop();events.put(("closed",None))
        threading.Thread(target=cleanup,daemon=False).start()
    tk.Button(window,text="Encerrar GTO Trainer",command=close).pack(pady=3)
    tk.Label(window,text="Fechar esta janela encerra o servidor. Fechar a aba do navegador não encerra.",wraplength=470,bg="#0f172a",fg="#94a3b8",font=("Segoe UI",9)).pack(pady=8)
    window.protocol("WM_DELETE_WINDOW",close)
    def poll():
        nonlocal ready
        try:
            while True:
                kind,value=events.get_nowait()
                if kind=="ready" and not closing:
                    ready=True;status.set(f"Pronto · {runtime.url}\nBiblioteca local disponível. Internet não é necessária.");open_button.config(state="normal");webbrowser.open(runtime.url)
                elif kind=="error" and not closing:
                    status.set(value);messagebox.showerror("GTO Trainer",value)
                elif kind=="closed":window.destroy();return
        except queue.Empty:pass
        if ready and not closing and runtime.process and runtime.process.poll() is not None:
            ready=False;runtime.stop();status.set("O servidor foi encerrado inesperadamente. Seus dados foram preservados. Feche e abra novamente.");open_button.config(state="disabled");messagebox.showerror("GTO Trainer",status.get())
        window.after(400,poll)
    window.after(100,poll)
    try:window.mainloop()
    finally:runtime.stop();kernel.CloseHandle(mutex)

if __name__=="__main__":
    try:main()
    except Exception:
        messagebox.showerror("GTO Trainer","Não foi possível iniciar. Confira permissões, Python/Tk e a preparação inicial.")
