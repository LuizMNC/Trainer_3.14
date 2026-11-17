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
        messagebox.showerror("TreinerLM","Não foi possível criar o controle de instância.");return
    if already:
        url=reopen_existing(root_path)
        if url:webbrowser.open(url)
        else:messagebox.showinfo("TreinerLM","O TreinerLM já está aberto ou iniciando. Aguarde a janela existente. Nenhum novo servidor foi iniciado.")
        kernel.CloseHandle(mutex);return
    window=tk.Tk();window.title("TreinerLM · Estúdio Offline MTT");window.geometry("510x252");window.resizable(False,False)
    icon=root_path/"windows/gto-trainer.ico"
    if icon.exists():window.iconbitmap(str(icon))
    window.configure(bg="#05070B")
    tk.Frame(window,bg="#DC2626",height=3).pack(fill="x")
    tk.Label(window,text="π  TreinerLM",font=("Segoe UI",21,"bold"),bg="#05070B",fg="#F8FAFC").pack(pady=(16,8))
    status=tk.StringVar(value="Verificando dependências e iniciando o estúdio local MTT…")
    tk.Label(window,textvariable=status,wraplength=465,bg="#05070B",fg="#CBD5E1",font=("Segoe UI",10)).pack(pady=4)
    runtime=Runtime(root_path);events=queue.Queue();closing=False;ready=False
    open_button=tk.Button(window,text="Abrir no navegador",state="disabled",bg="#2563EB",fg="#FFFFFF",activebackground="#1D4ED8",activeforeground="#FFFFFF",relief="flat",padx=14,pady=5,font=("Segoe UI",9,"bold"),command=lambda:webbrowser.open(runtime.url));open_button.pack(pady=8)
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
    tk.Button(window,text="Encerrar TreinerLM",bg="#090D16",fg="#FCA5A5",activebackground="#1E293B",activeforeground="#FFFFFF",relief="groove",padx=12,pady=4,font=("Segoe UI",9,"bold"),command=close).pack(pady=3)
    tk.Label(window,text="Fechar esta janela encerra o servidor. Fechar a aba do navegador não encerra.",wraplength=470,bg="#05070B",fg="#94A3B8",font=("Segoe UI",9)).pack(pady=8)
    window.protocol("WM_DELETE_WINDOW",close)
    def poll():
        nonlocal ready
        try:
            while True:
                kind,value=events.get_nowait()
                if kind=="ready" and not closing:
                    ready=True;status.set(f"Pronto · {runtime.url}\nBiblioteca local disponível. Internet não é necessária.");open_button.config(state="normal");webbrowser.open(runtime.url)
                elif kind=="error" and not closing:
                    status.set(value);messagebox.showerror("TreinerLM",value)
                elif kind=="closed":window.destroy();return
        except queue.Empty:pass
        if ready and not closing and runtime.process and runtime.process.poll() is not None:
            ready=False;runtime.stop();status.set("O servidor foi encerrado inesperadamente. Seus dados foram preservados. Feche e abra novamente.");open_button.config(state="disabled");messagebox.showerror("TreinerLM",status.get())
        window.after(400,poll)
    window.after(100,poll)
    try:window.mainloop()
    finally:runtime.stop();kernel.CloseHandle(mutex)

if __name__=="__main__":
    try:main()
    except Exception:
        messagebox.showerror("TreinerLM","Não foi possível iniciar. Confira permissões, Python/Tk e a preparação inicial.")
