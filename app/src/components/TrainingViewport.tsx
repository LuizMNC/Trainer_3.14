"use client";

import React, { useEffect, useRef } from "react";

/** Move apenas a apresentação; o estado da sessão continua no TrainerView. */
export function TrainingViewport({ active, onClose, children }: {
  active: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousScroll = window.scrollY;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-trainer-focus]")?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      document.querySelector<HTMLElement>("[data-trainer-start]")?.focus({ preventScroll: true });
      window.scrollTo({ top: previousScroll, behavior: "instant" });
    };
  }, [active]);

  return (
    <>
      {!active && children}
      <dialog ref={dialogRef} className="trainer-fullscreen" aria-label="Treinamento TreinerLM" onCancel={event => { event.preventDefault(); onClose(); }}>
        {active && children}
      </dialog>
    </>
  );
}
