import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Projeto-Poker | GTO Trainer & AI Poker Coach",
  description:
    "Plataforma pessoal de estudos GTO pré-flop com Modo Trainer interativo, Explorador de Ranges (229 spots) e AI Poker Coach via Google AI Studio.",
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
