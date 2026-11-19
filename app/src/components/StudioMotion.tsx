"use client";

import React, { createContext, useContext, useState } from "react";

export type StudioMotion = "normal" | "fast" | "off";
const MotionContext = createContext<{ motion: StudioMotion; setMotion: (motion: StudioMotion) => void } | null>(null);

/** Preferência visual em memória; não altera o armazenamento das sessões de estudo. */
export function StudioMotionProvider({ children }: { children: React.ReactNode }) {
  const [motion, setMotion] = useState<StudioMotion>("normal");
  return <MotionContext.Provider value={{ motion, setMotion }}>{children}</MotionContext.Provider>;
}

export function useStudioMotion() {
  const [localMotion, setLocalMotion] = useState<StudioMotion>("normal");
  const context = useContext(MotionContext);
  // Componentes também podem ser renderizados isoladamente, como antes do redesign.
  return context ?? { motion: localMotion, setMotion: setLocalMotion };
}
