"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Play, RotateCcw } from "lucide-react";
import type { CanonicalSpot } from "@/lib/poker/strategySchema";
import type { ConfidenceLevel, TrainerModeId } from "@/lib/poker/adaptiveDiagnostics";
import { CLASSIFICATION_LABELS, FATAL_ERRORS, FATAL_ERRORS_NOTICE, getFatalErrorLessons, getFatalErrorPracticeSpots, type FatalErrorId } from "@/lib/poker/fatalErrorsCatalog";
import { createFatalErrorAttempt, EMPTY_FATAL_FILTERS, filterFatalErrors, getFatalErrorSchedule, getFatalErrorStatus, loadFatalErrorStudy, retainFatalErrorAttempts, saveFatalErrorStudy, STUDY_STATUS_LABELS, type FatalErrorAttempt, type FatalErrorFilters } from "@/lib/poker/fatalErrorsStudy";
import { fatalErrorPracticeNavigation } from "@/lib/studyNavigation";
import { FatalErrorCalculator } from "./FatalErrorCalculator";
import { FatalErrorQuiz } from "./FatalErrorQuiz";

interface FatalErrorsViewProps {
  spots: readonly CanonicalSpot[];
  onLaunchDrill: (spotId: string, mode?: TrainerModeId) => void;
}

export function FatalErrorsView({ spots, onLaunchDrill }: FatalErrorsViewProps) {
  const [attempts, setAttempts] = useState<FatalErrorAttempt[]>([]);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [filters, setFilters] = useState<FatalErrorFilters>(EMPTY_FATAL_FILTERS);
  const [selectedId, setSelectedId] = useState<FatalErrorId>("EF01");
  const [answeredId, setAnsweredId] = useState<FatalErrorId | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      // Acesso ao próprio localStorage também pode lançar em navegadores restritos.
      try {
        const loaded = loadFatalErrorStudy(window.localStorage);
        setAttempts(loaded.attempts);
        setWarning(loaded.warning);
      } catch { setWarning("Armazenamento local indisponível; o progresso fica nesta sessão."); }
      setNow(Date.now());
      setReady(true);
    });
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const filtered = filterFatalErrors(FATAL_ERRORS, filters, attempts, now);
  const card = (answeredId ? FATAL_ERRORS.find(c => c.id === answeredId) : undefined) ?? filtered.find(c => c.id === selectedId) ?? filtered[0];
  const schedule = getFatalErrorSchedule(attempts, now);
  const due = schedule.filter(s => s.isDueNow);
  const review = card ? schedule.find(s => s.spotId === `fatal:${card.id}`) : undefined;
  const cardAttempts = card ? attempts.filter(a => a.errorId === card.id) : [];
  const incorrect = cardAttempts.filter(a => !a.isCorrect);
  const practiceSpots = card ? getFatalErrorPracticeSpots(card, spots) : [];

  function handleAnswer(chosenIndex: number, confidenceLevel: ConfidenceLevel, timestamp: number, attemptId: string) {
    if (!card || !ready) return;
    const attempt = createFatalErrorAttempt({ attemptId, errorId: card.id, quizId: card.quiz.id, timestamp, chosenIndex, confidenceLevel });
    const next = retainFatalErrorAttempts([attempt, ...attempts]);
    setAttempts(next);
    // Mantém o feedback visível mesmo quando o acerto muda o filtro de status.
    setAnsweredId(card.id);
    setNow(timestamp);
    try { setWarning(saveFatalErrorStudy(window.localStorage, next)); }
    catch { setWarning("O progresso está apenas nesta sessão: armazenamento local indisponível."); }
  }

  const updateFilter = <K extends keyof FatalErrorFilters>(key: K, value: FatalErrorFilters[K]) => {
    setAnsweredId(null);
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  const selectClass = "mt-1 block w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-sm";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-amber-900/70 bg-slate-900 p-4 sm:p-6 space-y-3">
        <h2 className="flex gap-2 items-center text-xl font-extrabold"><AlertTriangle className="text-amber-400 w-6 h-6" />Erros Fatais</h2>
        <p className="text-sm text-slate-300">20 armadilhas para estudar decisões, contexto e processo no poker. Uma mão perdida não define uma decisão errada.</p>
        <p className="text-xs text-amber-200">{FATAL_ERRORS_NOTICE} Uma ação pode pertencer a uma estratégia mista e ser inadequada como regra universal.</p>
        <p className="text-xs text-slate-400">Fonte: Dossie/CATALOGO_ERROS_FATAIS_GTO.json. Explicações, contrapontos, quizzes e dificuldade são complementos editoriais didáticos desta fase.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-2" aria-label="Progresso conceitual">
          <p><strong className="text-emerald-300">{new Set(attempts.map(a => a.errorId)).size}/20</strong><br />cartões praticados</p>
          <p><strong>{attempts.length}</strong><br />respostas recentes</p>
          <p><strong>{attempts.filter(a => a.isCorrect).length}</strong><br />acertos nas respostas recentes</p>
          <p><strong className="text-amber-300">{due.length}</strong><br />revisões pendentes</p>
        </div>
        <p className="text-xs text-slate-400">Indicadores calculados nas até 100 respostas mais recentes de cada cartão; não representam totais cumulativos.</p>
      </section>

      {!ready && <p role="status" className="text-sm">Carregando progresso local…</p>}
      {warning && <p role="status" className="border border-amber-700 rounded-lg p-3 text-sm text-amber-200">{warning}</p>}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800" aria-label="Filtros de erros">
        <label className="text-xs text-slate-300">Street / contexto
          <select className={selectClass} value={filters.street} onChange={e => updateFilter("street", e.target.value as FatalErrorFilters["street"])}>
            <option value="all">Todos os contextos</option>{[...new Set(FATAL_ERRORS.map(c => c.category))].map(street => <option key={street}>{street}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Categoria de evidência
          <select className={selectClass} value={filters.category} onChange={e => updateFilter("category", e.target.value as FatalErrorFilters["category"])}>
            <option value="all">Todas as categorias</option>{Object.entries(CLASSIFICATION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Dificuldade didática
          <select className={selectClass} value={filters.difficulty} onChange={e => updateFilter("difficulty", e.target.value as FatalErrorFilters["difficulty"])}>
            <option value="all">Todas as dificuldades</option>{["Básica", "Intermediária", "Avançada"].map(d => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Status de estudo
          <select className={selectClass} value={filters.status} onChange={e => updateFilter("status", e.target.value as FatalErrorFilters["status"])}>
            <option value="all">Todos os status</option>{Object.entries(STUDY_STATUS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="incorrect">Com respostas incorretas</option>
          </select>
        </label>
        <button type="button" className="text-xs text-emerald-300 underline justify-self-start" onClick={() => { setAnsweredId(null); setFilters(EMPTY_FATAL_FILTERS); }}>Limpar filtros</button>
      </section>

      {due.length > 0 && <section className="p-4 rounded-xl bg-amber-950/20 border border-amber-900 space-y-2" aria-label="Repetição espaçada">
        <h3 className="text-sm font-bold text-amber-200 flex gap-2"><RotateCcw className="w-4 h-4" />Revisar agora · Leitner</h3>
        <div className="flex flex-wrap gap-2">{due.map(item => <button key={item.spotId} type="button" className="text-xs underline text-amber-100 text-left" onClick={() => { setAnsweredId(null); setFilters(EMPTY_FATAL_FILTERS); setSelectedId(item.spotId.slice(6) as FatalErrorId); }}>{item.spotId.slice(6)} · {item.spotName}</button>)}</div>
      </section>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] gap-5">
        <section aria-label="Cartões de erros" className="min-w-0">
          <p className="text-xs text-slate-400 mb-3" role="status">{filtered.length} de 20 cartões</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 lg:max-h-[1100px] lg:overflow-y-auto lg:pr-1">
            {filtered.map(item => <button key={item.id} type="button" aria-pressed={item.id === card?.id} className={`text-left rounded-xl border p-3 space-y-2 ${item.id === card?.id ? "bg-emerald-950/40 border-emerald-600" : "bg-slate-900 border-slate-800 hover:border-slate-600"}`} onClick={() => { setAnsweredId(null); setSelectedId(item.id); }}>
              <span className="block text-xs text-slate-400">{item.id} · {item.category} · {item.difficulty}</span>
              <span className="block text-sm font-bold">{item.title}</span>
              <span className="block text-xs text-emerald-300">{STUDY_STATUS_LABELS[getFatalErrorStatus(item, attempts, now)]}</span>
            </button>)}
          </div>
        </section>

        {card ? <article className="min-w-0 space-y-4" key={card.id}>
          {!filtered.includes(card) && <p role="status" className="text-xs text-emerald-200">Este cartão mudou de status. O feedback continua visível até você escolher outro cartão ou filtro.</p>}
          <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-3">
            <h3 className="text-lg font-bold">{card.id} · {card.title}</h3>
            <p className="text-xs text-amber-300">EDUCATIONAL_HEURISTIC · Referência do cartão: UNSOLVED · EV loss indisponível · Diagnóstico automático desativado</p>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-300">
              <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-3"><dt className="font-bold text-white text-xs uppercase tracking-wider text-emerald-300">Por que estudar</dt><dd className="mt-1 text-xs leading-relaxed">{card.explanation}</dd></div>
              <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-3"><dt className="font-bold text-white text-xs uppercase tracking-wider text-amber-300">Sinal de risco, não diagnóstico</dt><dd className="mt-1 text-xs leading-relaxed">{card.riskSignal}</dd></div>
            </dl>
          </section>

          {/* PRÁTICA IMEDIATA: Quiz, Calculadora e Cenário Relacionado antes dos blocos longos */}
          <FatalErrorQuiz card={card} ready={ready} onAnswer={handleAnswer} />
          {card.calculator && <FatalErrorCalculator kind={card.calculator} />}

          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3" aria-label="Prática no treinador">
            <h3 className="font-bold text-sm">Praticar um cenário relacionado</h3>
            {practiceSpots.map(spot => <div key={spot.spotId} className="text-sm space-y-2">
              <p>{spot.name}</p><p className="text-xs text-slate-400">{spot.referenceStrategy.status} · Modo Aprendizagem. A referência mantém seu próprio status; não valida o cartão como regra universal.</p>
              <button type="button" className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg font-bold text-xs" onClick={() => {
                const navigation = fatalErrorPracticeNavigation(card, spots, spot.spotId);
                if (navigation) onLaunchDrill(navigation.requestedSpotId, navigation.requestedMode ?? undefined);
              }}><Play className="w-3.5 h-3.5" />Iniciar no treinador</button>
            </div>)}
            {practiceSpots.length === 0 && <p className="text-xs text-slate-400">Sem spot compatível vinculado para lançamento direto. Pratique o quiz conceitual acima.</p>}
          </section>

          {/* REVELAÇÃO PROGRESSIVA: Exemplo, Correção, Exceção e Aulas */}
          <details className="rounded-xl bg-slate-900 border border-slate-800 p-4 group">
            <summary className="cursor-pointer font-bold text-sm text-emerald-300 flex items-center justify-between">
              <span>Entenda o motivo · Exemplo prático, Correção e Exceção</span>
              <span className="text-xs text-slate-400 group-open:hidden">Expandir</span>
            </summary>
            <dl className="space-y-3 text-sm text-slate-300 mt-3 pt-3 border-t border-slate-800">
              <div><dt className="font-bold text-white">Exemplo do catálogo</dt><dd className="mt-1">{card.sampleScenario}</dd></div>
              <div><dt className="font-bold text-white">Como corrigir o raciocínio</dt><dd className="mt-1">{card.correctiveStudy}</dd></div>
              <div><dt className="font-bold text-white">Exceção / contraponto didático</dt><dd className="mt-1">{card.exception}</dd></div>
            </dl>
          </details>

          <details className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 group" aria-label="Aulas relacionadas">
            <summary className="cursor-pointer flex items-center justify-between font-bold text-sm">
              <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-400" />Conceitos relacionados · TreinerLM</span>
              <span className="text-xs text-slate-400 group-open:hidden">Consultar fonte</span>
            </summary>
            <div className="space-y-3 mt-3 pt-3 border-t border-slate-800">
              <p className="text-xs text-slate-400">Relação temática editorial; as aulas não são prova de solução GTO deste erro.</p>
              {getFatalErrorLessons(card).map(lesson => <div key={lesson.spotNumber} className="text-sm space-y-1">
                <a className="text-emerald-300 underline" href={lesson.url} target="_blank" rel="noreferrer">Aula {lesson.spotNumber} · {lesson.moduleLabel}</a>
                <p className="text-xs text-slate-300">{lesson.coreConcept}</p>
                <p className="text-xs text-slate-400">{lesson.evidenceType}</p>
                {lesson.unverifiedWarning && <p className="text-xs text-amber-200">{lesson.unverifiedWarning}</p>}
              </div>)}
              {card.lessons.length === 0 && <p className="text-xs text-slate-400">Não há aula específica documentada para este tema de processo.</p>}
            </div>
          </details>

          <section className="rounded-xl border border-slate-800 p-4 space-y-2 text-sm" aria-label="Histórico de estudo do cartão">
            <h3 className="font-bold">Seu estudo deste cartão</h3>
            <p>{cardAttempts.length} respostas recentes · {incorrect.length} incorretas nesta janela</p>
            {review ? <p className="text-xs text-slate-300">Caixa {review.boxLevel}/5 · intervalo {review.intervalDays} dias · {review.isDueNow ? "Revisar agora" : `Próxima revisão: ${new Date(review.nextReviewAt).toLocaleString("pt-BR")}`}</p> : <p className="text-xs text-slate-400">Responda ao quiz para entrar na revisão espaçada.</p>}
            <p className="text-xs text-slate-400">Mesmo agendador Leitner do treinador: 0, 1, 3, 7, 14 e 30 dias. Erros voltam à caixa 0; a confiança modula o avanço. Quizzes ficam separados das métricas GTO. Até 100 respostas recentes por cartão são mantidas neste navegador.</p>
            {incorrect.length > 0 && <details><summary className="cursor-pointer text-amber-200">Últimas respostas incorretas</summary><ul className="mt-2 space-y-2 text-xs">{incorrect.slice(0, 5).map(a => <li key={a.attemptId}>{new Date(a.timestamp).toLocaleString("pt-BR")} · Confiança {a.confidenceLevel}<br />Resposta: {card.quiz.options[a.chosenIndex]}</li>)}</ul></details>}
          </section>
        </article> : <p className="rounded-xl border border-slate-800 p-6 text-sm text-slate-300">Nenhum cartão corresponde aos filtros. Use “Limpar filtros” para voltar ao catálogo.</p>}
      </div>
    </div>
  );
}
