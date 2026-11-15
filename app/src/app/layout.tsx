import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TreinerLM",
  description:
    "TreinerLM — Plataforma de estudos GTO com Modo Trainer interativo, Explorador de Ranges (229 spots), Laboratório Matemático e AI Poker Coach. Desenvolvido por Luiz Miguel N. C.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
