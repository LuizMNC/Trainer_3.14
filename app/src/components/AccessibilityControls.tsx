"use client";

import React, { useEffect, useState } from "react";

const FONT_SIZE_KEY = "pdf_de_poker_font_size_v1";
const MIN_SIZE = 100;
const MAX_SIZE = 150;

export function AccessibilityControls() {
  const [fontSize, setFontSize] = useState(MIN_SIZE);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = Number(localStorage.getItem(FONT_SIZE_KEY));
        if (saved >= MIN_SIZE && saved <= MAX_SIZE && saved % 10 === 0) setFontSize(saved);
      } catch {
        // O ajuste continua disponível se o navegador bloquear o armazenamento.
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
  }, [fontSize]);

  function changeFontSize(value: number) {
    setFontSize(value);
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(value));
    } catch {
      // Mantém o ajuste durante esta visita.
    }
  }

  const buttonClass = "min-h-9 px-2.5 rounded-lg text-xs font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed";

  return (
    <div data-tour="font-size" role="group" aria-label="Tamanho da fonte" className="flex items-center rounded-xl border border-slate-700 bg-slate-900 p-0.5">
      <button type="button" aria-label="Diminuir fonte" title="Diminuir fonte" disabled={fontSize === MIN_SIZE} onClick={() => changeFontSize(fontSize - 10)} className={buttonClass}>A−</button>
      <button type="button" aria-label="Restaurar tamanho padrão da fonte" title="Restaurar fonte para 100%" onClick={() => changeFontSize(MIN_SIZE)} className={buttonClass}>
        <span role="status" aria-label={`Tamanho da fonte: ${fontSize}%`}>{fontSize}%</span>
      </button>
      <button type="button" aria-label="Aumentar fonte" title="Aumentar fonte" disabled={fontSize === MAX_SIZE} onClick={() => changeFontSize(fontSize + 10)} className={buttonClass}>A+</button>
    </div>
  );
}
