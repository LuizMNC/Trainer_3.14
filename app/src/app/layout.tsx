import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TreinerLM",
  description:
    "TreinerLM — Plataforma responsiva de estudos GTO exclusiva para torneios MTT com Treiner Limpo, Modo Trainer, Explorador de Ranges MTT, Laboratório Matemático e TheNerdEinsten. Desenvolvido por Luiz Miguel N. C.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#05070B] text-[#F8FAFC] antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
