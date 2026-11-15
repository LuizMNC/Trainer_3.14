"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import type { TabId } from "@/lib/studyNavigation";

interface TourStep {
  title: string;
  description: string;
  tip: string;
  target: string;
  tab?: TabId;
}

const STEPS: readonly TourStep[] = [
  { title: "Bem-vindo ao PDF de Poker", description: "Vamos conhecer as ferramentas para organizar seus estudos e revisar suas decisões. A área de cada etapa aparece destacada ao fundo.", tip: "Use Próximo e Anterior para explorar. Você pode sair a qualquer momento com Esc e repetir o tour pelo botão no topo.", target: "navigation" },
  { title: "Biblioteca de Mãos", description: "Importe históricos de mãos, organize seu acervo e encontre situações para revisar depois da sessão.", tip: "Selecione uma mão da biblioteca para abri-la no Replayer. Durante o tour, nenhum arquivo é importado.", target: "hand-library", tab: "hand-library" },
  { title: "Modo Trainer", description: "Pratique decisões de poker com filtros por cenário, posição e stack. Clique em Iniciar treino em tela cheia para abrir a mesa dedicada, com estatísticas e animações.", tip: "Use Esc para sair sem perder a sessão. Em Animações, escolha Normal, Rápidas ou Desligadas. Observe a origem e a verificação de cada estratégia.", target: "trainer", tab: "trainer" },
  { title: "Currículo e aulas", description: "Siga as trilhas de estudo, consulte as 18 aulas e os vídeos complementares e teste os conceitos nos quizzes.", tip: "Os botões de prática levam aos exercícios relacionados no Trainer.", target: "curriculum", tab: "curriculum" },
  { title: "Erros Fatais", description: "Estude 20 erros frequentes, entenda as exceções e use quizzes e calculadoras para revisar cada conceito.", tip: "Filtre pelo tema ou pelo seu status de estudo para escolher o próximo assunto.", target: "fatal-errors", tab: "fatal-errors" },
  { title: "Replayer", description: "Reveja uma mão ação por ação e acompanhe a evolução do pote, das cartas e dos stacks.", tip: "Explore os exemplos disponíveis e envie uma situação ao Laboratório Matemático quando quiser aprofundar os cálculos.", target: "replayer", tab: "replayer" },
  { title: "Explorador de Ranges", description: "Consulte as matrizes de mãos por posição, stack e situação. Compare cenários para entender como os ranges mudam.", tip: "Observe a legenda das cores e as frequências das ações em cada matriz.", target: "explorer", tab: "explorer" },
  { title: "Lab EV e ICM", description: "Explore cálculos de valor esperado e o efeito dos prêmios e dos stacks nas decisões de torneios.", tip: "Confira as hipóteses de cada cálculo antes de interpretar o resultado.", target: "math", tab: "math" },
  { title: "Laboratório Matemático", description: "Experimente equity, pot odds, blefes e valor esperado com cenários e gráficos interativos.", tip: "Altere uma variável por vez para entender o que muda no resultado.", target: "math-lab", tab: "math-lab" },
  { title: "AI Poker Coach", description: "Converse sobre conceitos e revise dúvidas com apoio do seu material de estudo e da integração com o Google AI Studio.", tip: "A chave de API é opcional para as outras áreas. O tour não envia mensagens nem faz consultas à IA.", target: "coach", tab: "coach" },
  { title: "Diagnóstico e Leaks", description: "Acompanhe o histórico dos exercícios e identifique os cenários que merecem mais prática.", tip: "Os resultados começam a aparecer conforme você treina. Use os atalhos de prática para revisar suas dificuldades.", target: "stats", tab: "stats" },
  { title: "Uma fonte mais confortável", description: "No topo do site, use A+ para aumentar a fonte em etapas de 10%, até 150%. Use A− para diminuir.", tip: "Clique no percentual para voltar a 100%. Sua preferência fica salva neste navegador.", target: "font-size" },
  { title: "Configurações e próximos passos", description: "O botão de configurações permite ajustar a integração com o AI Poker Coach. Você já pode começar a explorar o PDF de Poker.", tip: "Ao concluir, você volta à área em que estava. Para rever este guia, clique em Fazer um tour.", target: "settings" },
];

interface SiteTourProps {
  onNavigate: (tab: TabId) => void;
  onClose: () => void;
}

export function SiteTour({ onNavigate, onClose }: SiteTourProps) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (step.tab) onNavigate(step.tab);
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    target?.setAttribute("data-tour-active", "true");
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    headingRef.current?.focus({ preventScroll: true });
    return () => target?.removeAttribute("data-tour-active");
  }, [step, onNavigate]);

  return (
    <dialog ref={dialogRef} className="site-tour" aria-labelledby="site-tour-title" aria-describedby="site-tour-description" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-5 py-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><Compass className="h-4 w-4" aria-hidden="true" />Tour pelo site · {index + 1} de {STEPS.length}</p>
        <button type="button" onClick={onClose} aria-label="Fechar tour" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 px-5 py-4">
        <h2 ref={headingRef} id="site-tour-title" tabIndex={-1} className="text-lg font-bold text-white outline-none">{step.title}</h2>
        <p id="site-tour-description" className="text-sm leading-relaxed text-slate-200">{step.description}</p>
        <p className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs leading-relaxed text-emerald-100">{step.tip}</p>
        <progress aria-label="Progresso do tour" value={index + 1} max={STEPS.length} className="h-1.5 w-full accent-emerald-400" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">Sair do tour</button>
        <div className="flex gap-2">
          <button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)} className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-35"><ArrowLeft className="h-3.5 w-3.5" />Anterior</button>
          <button type="button" onClick={() => index === STEPS.length - 1 ? onClose() : setIndex(value => value + 1)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">{index === STEPS.length - 1 ? "Concluir tour" : "Próximo"}<ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </dialog>
  );
}
