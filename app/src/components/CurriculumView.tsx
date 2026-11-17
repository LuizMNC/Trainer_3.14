"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  FileWarning,
  FlaskConical,
  HelpCircle,
  Layers,
  Play,
  ShieldAlert,
  Sparkles,
  Video,
} from "lucide-react";
import { CURRICULUM_MODULES, type CurriculumModule } from "@/lib/curriculum";
import {
  getLessonsByTrackId,
  pluralizePtBr,
  REGLIFE_18_LESSONS,
  REGLIFE_CATALOG_METADATA,
  REGLIFE_SUPPLEMENTAL_VIDEOS,
  type RegLifeSeriesLesson,
  type TrainerModeId,
} from "@/lib/poker";

interface CurriculumViewProps {
  onLaunchDrill: (spotId: string, preferredMode?: TrainerModeId) => void;
}

type ScreenStep = "theory" | "why" | "exploit" | "lessons" | "drill";
type CatalogTab = "tracks" | "series18" | "supplemental7";
type TranscriptFilter = "all" | "verified" | "unverified";

export function CurriculumView({ onLaunchDrill }: CurriculumViewProps) {
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("tracks");
  const [selectedId, setSelectedId] = useState<string>(CURRICULUM_MODULES[0].id);
  const [activeStep, setActiveStep] = useState<ScreenStep>("theory");

  const [selectedSpotNumber, setSelectedSpotNumber] = useState<number>(2);
  const [transcriptFilter, setTranscriptFilter] = useState<TranscriptFilter>("all");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});

  const activeModule: CurriculumModule =
    CURRICULUM_MODULES.find((m) => m.id === selectedId) ?? CURRICULUM_MODULES[0];

  const trackLessons = getLessonsByTrackId(activeModule.id);

  const filteredSeriesLessons = REGLIFE_18_LESSONS.filter((l) => {
    if (transcriptFilter === "verified") return l.hasVerifiedTranscript;
    if (transcriptFilter === "unverified") return !l.hasVerifiedTranscript;
    return true;
  });

  const activeLesson: RegLifeSeriesLesson =
    REGLIFE_18_LESSONS.find((l) => l.spotNumber === selectedSpotNumber) ??
    filteredSeriesLessons[0] ??
    REGLIFE_18_LESSONS[0];

  const steps: { id: ScreenStep; label: string; icon: React.ReactNode }[] = [
    { id: "theory", label: "1. Teoria Curta", icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: "why", label: "2. Por quê (Causal)", icon: <HelpCircle className="w-3.5 h-3.5" /> },
    { id: "exploit", label: "3. Exploit Condicionado", icon: <Compass className="w-3.5 h-3.5" /> },
    {
      id: "lessons",
      label: `4. Aulas (${trackLessons.length})`,
      icon: <Video className="w-3.5 h-3.5" />,
    },
    { id: "drill", label: "5. Simulador de Decisão", icon: <Play className="w-3.5 h-3.5" /> },
  ];

  const renderLessonCard = (lesson: RegLifeSeriesLesson) => {
    const selectedAnswer = quizAnswers[lesson.quiz.id];
    const isAnswered = selectedAnswer !== undefined;
    const isCorrect = selectedAnswer === lesson.quiz.correctIndex;

    return (
      <div className="space-y-4">
        {/* Cabeçalho da Aula */}
        <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-[#2563EB]/20 border border-[#3B82F6]/40 text-sky-200 text-xs font-bold">
                Spot {String(lesson.spotNumber).padStart(2, "0")}/18
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#090D16] border border-[#1E293B] text-slate-300 text-xs font-medium">
                Módulo: {lesson.moduleLabel}
              </span>
              {lesson.hasVerifiedTranscript ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F1B33] border border-[#2563EB]/50 text-sky-200 text-[0.6875rem] font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#60A5FA]" />
                  Transcrição Verificada ({lesson.publicSource})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2B0B11] border border-[#DC2626]/60 text-red-200 text-[0.6875rem] font-semibold">
                  <FileWarning className="w-3.5 h-3.5 text-[#F87171]" />
                  Sem Transcrição — Apenas Metadados ({lesson.publicSource})
                </span>
              )}
            </div>

            <a
              href={lesson.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626]/20 hover:bg-[#DC2626]/30 border border-[#DC2626]/50 px-3 py-1.5 text-xs font-semibold text-red-200 transition"
            >
              <Video className="w-3.5 h-3.5" />
              Vídeo de Referência ({lesson.publishedDate})
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <h4 className="text-base font-bold text-white">{lesson.title}</h4>

          {lesson.unverifiedWarning && (
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/50 p-3 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-amber-300 mb-0.5">
                  Aviso de Auditoria Documental (Sem Transcrição Verificada)
                </span>
                {lesson.unverifiedWarning}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[#090D16] border border-[#1E293B] p-3 text-xs text-slate-200 leading-relaxed">
            <span className="text-[#60A5FA] font-bold block mb-1">Conceito Central:</span>
            {lesson.coreConcept}
          </div>
        </div>

        {/* 1. PRÁTICA IMEDIATA: Quiz Interativo + Exercícios Vinculados (Menos Texto, Mais Ação) */}
        <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#60A5FA] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Quiz de Fixação Conceitual (Spot {String(lesson.spotNumber).padStart(2, "0")})
            </span>
            <span className="text-[0.6875rem] font-mono px-2 py-0.5 rounded bg-[#090D16] border border-[#1E293B] text-slate-400">
              Evidência: {lesson.quiz.evidenceType}
            </span>
          </div>

          <p className="text-xs sm:text-sm font-semibold text-white">{lesson.quiz.question}</p>

          <div className="space-y-2">
            {lesson.quiz.options.map((opt, idx) => {
              const isChosen = selectedAnswer === idx;
              const isRightOption = idx === lesson.quiz.correctIndex;
              let btnStyle =
                "bg-[#090D16] border-[#1E293B] text-slate-200 hover:border-[#334155]";
              if (isAnswered) {
                if (isRightOption) {
                  btnStyle = "bg-[#0F1B33] border-[#3B82F6] text-sky-100";
                } else if (isChosen) {
                  btnStyle = "bg-[#2B0B11] border-[#DC2626] text-red-100";
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setQuizAnswers((prev) => ({
                      ...prev,
                      [lesson.quiz.id]: idx,
                    }))
                  }
                  className={`w-full text-left rounded-xl border p-3 text-xs transition flex items-start gap-2.5 ${btnStyle}`}
                >
                  <span className="font-mono font-bold text-slate-400">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div
              className={`rounded-xl border p-3 text-xs leading-relaxed ${
                isCorrect
                  ? "bg-[#0F1B33] border-[#2563EB]/60 text-sky-200"
                  : "bg-[#2B0B11] border-[#DC2626]/60 text-red-200"
              }`}
            >
              <span className="font-bold block mb-1">
                {isCorrect ? "Resposta Correta!" : "Revisão Conceitual:"}
              </span>
              {lesson.quiz.explanation}
            </div>
          )}
        </div>

        {/* Exercícios Práticos Vinculados */}
        <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-4 space-y-2.5">
          <span className="text-xs font-bold text-white block">
            Exercícios Práticos Vinculados (Ir para a Mesa)
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lesson.exercises.map((ex) => (
              <div
                key={ex.id}
                className="rounded-xl bg-[#090D16] border border-[#1E293B] p-3 flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{ex.title}</span>
                    <span
                      className={`text-[0.6875rem] font-bold px-2 py-0.5 rounded ${
                        ex.recommendedMode === "GTO_TECHNICAL"
                          ? "bg-[#2563EB]/20 text-sky-200 border border-[#3B82F6]/40"
                          : "bg-[#DC2626]/20 text-red-200 border border-[#DC2626]/40"
                      }`}
                    >
                      {ex.recommendedMode === "GTO_TECHNICAL"
                        ? "Modo GTO Técnico"
                        : "Modo Aprendizagem"}
                    </span>
                  </div>
                  <p className="text-[0.6875rem] text-slate-400 mt-1">{ex.objective}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onLaunchDrill(ex.linkedSpotId, ex.recommendedMode)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] px-3 py-2 text-xs font-bold text-white transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  Praticar Exercício ({ex.linkedSpotId})
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2. REVELAÇÃO PROGRESSIVA: Separação Epistemológica, Exemplos e Timestamps sob demanda */}
        <details className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3.5 group">
          <summary className="cursor-pointer text-xs font-bold text-[#60A5FA] flex items-center justify-between">
            <span>Entenda o motivo — Separação: Didático vs Exploit vs Solver GTO</span>
            <span className="text-[0.6875rem] text-slate-400 group-open:hidden">Expandir</span>
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div className="rounded-xl bg-[#0F1B33]/60 border border-[#2563EB]/40 p-3.5 space-y-1.5">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#2563EB]/25 text-sky-200 inline-block">
                1. Conteúdo Educacional ({lesson.evidenceType})
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {lesson.separationOfDomains.educationalConcept}
              </p>
            </div>

            <div className="rounded-xl bg-[#2B0B11]/50 border border-[#DC2626]/40 p-3.5 space-y-1.5">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#DC2626]/20 text-red-200 inline-block">
                2. Heurística Explorativa Condicionada
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {lesson.separationOfDomains.exploitativeHeuristic}
              </p>
            </div>

            <div className="rounded-xl bg-[#090D16] border border-[#3B82F6]/40 p-3.5 space-y-1.5">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#3B82F6]/20 text-sky-200 inline-block">
                3. Solução GTO Matemática (Solver)
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {lesson.separationOfDomains.mathematicalGtoSpec}
              </p>
            </div>
          </div>
        </details>

        <details className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3.5 group">
          <summary className="cursor-pointer text-xs font-bold text-slate-200 flex items-center justify-between">
            <span>Exemplo Estruturado, Armadilha Comum &amp; Timestamps ({lesson.timestamps.length})</span>
            <span className="text-[0.6875rem] text-slate-400 group-open:hidden">Expandir</span>
          </summary>
          <div className="space-y-3 mt-3">
            {lesson.examples.map((ex, idx) => (
              <div key={idx} className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#60A5FA]">{ex.scenarioTitle}</span>
                  <span className="font-mono text-[0.6875rem] text-slate-400">{ex.tableContext}</span>
                </div>
                <p className="text-slate-200 leading-relaxed">{ex.didacticAnalysis}</p>
                <div className="rounded-lg bg-[#2B0B11]/60 border border-[#DC2626]/40 p-2.5 text-red-200">
                  <span className="font-bold text-[#F87171]">Armadilha a evitar: </span>
                  {ex.pitfallToAvoid}
                </div>
              </div>
            ))}

            {lesson.timestamps.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-[#1E293B]">
                <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#60A5FA]" />
                  Timestamps Verificados na Transcrição:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {lesson.timestamps.map((ts, idx) => (
                    <a
                      key={idx}
                      href={ts.urlWithTimestamp}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-[#0F1B33]/50 hover:bg-[#0F1B33] border border-[#2563EB]/40 p-2.5 text-xs transition flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#60A5FA]">{ts.label}</span>
                        <ExternalLink className="w-3 h-3 text-[#60A5FA]" />
                      </div>
                      <p className="text-slate-300 text-[0.6875rem] leading-relaxed">
                        {ts.paraphraseNote}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho e Seletor de Visão do Currículo */}
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[0.6875rem] uppercase tracking-wider text-[#60A5FA] font-bold">
            TreinerLM — 7 Trilhas + 18 Aulas + 7 Vídeos Complementares
          </span>
          <h2 className="text-lg font-bold text-white">
            Separação Estrita: Conteúdo Didático vs Heurística Explorativa vs Solução GTO
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {REGLIFE_CATALOG_METADATA.disclaimer}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[#05070B] border border-[#1E293B] rounded-xl p-1">
          <button
            type="button"
            onClick={() => setCatalogTab("tracks")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              catalogTab === "tracks"
                ? "bg-[#2563EB] text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            7 Trilhas Fundamentais
          </button>
          <button
            type="button"
            onClick={() => setCatalogTab("series18")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              catalogTab === "series18"
                ? "bg-[#2563EB] text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            18 Aulas (15 c/ Transcrição, 3 Metadados)
          </button>
          <button
            type="button"
            onClick={() => setCatalogTab("supplemental7")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              catalogTab === "supplemental7"
                ? "bg-[#2563EB] text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            7 Vídeos Complementares
          </button>
        </div>
      </div>

      {/* ABA 1: 7 TRILHAS FUNDAMENTAIS */}
      {catalogTab === "tracks" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Lista das 7 trilhas */}
          <details open className="lg:col-span-4 rounded-2xl bg-[#090D16] border border-[#1E293B] p-3 group">
            <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-bold text-slate-200 pb-2">
              <span>Trilhas (7) · {activeModule.title}</span>
              <span className="text-[0.6875rem] text-[#60A5FA] group-open:hidden">Abrir</span>
              <span className="text-[0.6875rem] text-slate-400 hidden group-open:inline">Recolher</span>
            </summary>
            <div className="space-y-1.5">
              {CURRICULUM_MODULES.map((mod) => {
                const active = mod.id === activeModule.id;
                const modLessons = getLessonsByTrackId(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(mod.id);
                      const firstInTrack = getLessonsByTrackId(mod.id)[0];
                      if (firstInTrack) {
                        setSelectedSpotNumber(firstInTrack.spotNumber);
                      }
                    }}
                    className={`w-full text-left rounded-xl px-3.5 py-2.5 border transition ${
                      active
                        ? "bg-[#0F1B33] border-[#3B82F6] text-white"
                        : "bg-[#05070B] border-[#1E293B] text-slate-300 hover:border-[#334155]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{mod.title}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-[#0F1B33] text-sky-200 border border-[#2563EB]/40">
                          {pluralizePtBr(modLessons.length, "aula", "aulas")}
                        </span>
                        <span className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-[#141D2F] text-slate-300">
                          {mod.streetFocus}
                        </span>
                      </div>
                    </div>
                    <p className="text-[0.6875rem] text-slate-400 mt-1 line-clamp-2">
                      {mod.shortSummary}
                    </p>
                  </button>
                );
              })}
            </div>
          </details>

          {/* Conteúdo da trilha selecionada */}
          <div className="lg:col-span-8 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
              <div>
                <h3 className="text-base font-bold text-white">{activeModule.title}</h3>
                <p className="text-xs text-slate-400">{activeModule.shortSummary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1 bg-[#05070B] border border-[#1E293B] rounded-xl p-1">
                {steps.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStep(s.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      activeStep === s.id
                        ? "bg-[#2563EB] text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {s.icon}
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeStep === "theory" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#60A5FA]">
                  {activeModule.theoryShort.heading}
                </h4>
                <ul className="space-y-2 text-xs sm:text-sm text-slate-200 leading-relaxed max-w-[68ch]">
                  {activeModule.theoryShort.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3 flex items-start gap-2.5"
                    >
                      <span className="text-[#60A5FA] font-mono font-bold">0{i + 1}.</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[0.6875rem] text-slate-400 font-semibold">Variáveis-chave:</span>
                  {activeModule.theoryShort.keyMetrics.map((m) => (
                    <span
                      key={m}
                      className="px-2.5 py-1 rounded-full bg-[#0F1B33] border border-[#2563EB]/50 text-sky-200 text-[0.6875rem] font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activeStep === "why" && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#60A5FA]">
                  {activeModule.causalWhy.heading}
                </h4>
                <div className="space-y-2.5">
                  {activeModule.causalWhy.mechanisms.map((mech, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3 text-xs sm:text-sm text-slate-200 leading-relaxed"
                    >
                      {mech}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-[#2B0B11]/60 border border-[#DC2626]/50 p-3.5 text-xs text-red-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-[#F87171] mb-0.5">
                      Erro clássico a evitar
                    </span>
                    {activeModule.causalWhy.commonMistake}
                  </div>
                </div>
              </div>
            )}

            {activeStep === "exploit" && (
              <div className="space-y-3">
                <div className="rounded-xl bg-amber-950/30 border border-amber-600/40 p-3 text-xs text-amber-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Cenário exploratório explicitamente condicionado: nunca trate desvios como regra fixa sem confirmar amostra e perfil da mesa.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                    <span className="text-slate-400 font-semibold block mb-1">Observação</span>
                    <p className="text-slate-200">{activeModule.conditionalExploit.observation}</p>
                  </div>
                  <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                    <span className="text-slate-400 font-semibold block mb-1">Amostra Mínima</span>
                    <p className="text-amber-300 font-medium">
                      {activeModule.conditionalExploit.sampleRequirement}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                    <span className="text-slate-400 font-semibold block mb-1">Hipótese Causal</span>
                    <p className="text-slate-200">{activeModule.conditionalExploit.hypothesis}</p>
                  </div>
                  <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                    <span className="text-slate-400 font-semibold block mb-1">Ajuste Candidato</span>
                    <p className="text-[#60A5FA]">
                      {activeModule.conditionalExploit.candidateAdjustment}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                    <span className="text-slate-400 font-semibold block mb-1">
                      Mudança Estimada de EV
                    </span>
                    <p className="text-slate-200">
                      {activeModule.conditionalExploit.expectedEvShiftNote}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#2B0B11]/60 border border-[#DC2626]/50 p-3">
                    <span className="text-[#F87171] font-semibold block mb-1">
                      Risco de Contraexploração
                    </span>
                    <p className="text-red-200">
                      {activeModule.conditionalExploit.counterExploitRisk}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeStep === "lessons" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#60A5FA]">
                    Unidades Didáticas vinculadas a {activeModule.title}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {trackLessons.map((l) => (
                      <button
                        key={l.spotNumber}
                        type="button"
                        onClick={() => setSelectedSpotNumber(l.spotNumber)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                          activeLesson.spotNumber === l.spotNumber
                            ? "bg-[#2563EB] border-[#3B82F6] text-white"
                            : "bg-[#05070B] border-[#1E293B] text-slate-300 hover:border-[#334155]"
                        }`}
                      >
                        Spot {String(l.spotNumber).padStart(2, "0")}
                        {!l.hasVerifiedTranscript ? " (Metadados)" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {renderLessonCard(
                  trackLessons.find((l) => l.spotNumber === selectedSpotNumber) ?? trackLessons[0],
                )}
              </div>
            )}

            {activeStep === "drill" && (
              <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#2563EB]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA] shrink-0">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Simulador vinculado: {activeModule.drillSpec.linkedSpotId}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {activeModule.drillSpec.demoNote}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onLaunchDrill(activeModule.drillSpec.linkedSpotId, "LEARNING")}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] px-4 py-2.5 text-xs font-bold text-white shadow transition"
                  >
                    <Play className="w-4 h-4" />
                    Abrir em Modo Aprendizagem
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onLaunchDrill(
                        "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
                        "GTO_TECHNICAL",
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] px-4 py-2.5 text-xs font-bold text-white shadow transition"
                  >
                    <Layers className="w-4 h-4" />
                    Abrir Solução Verificada em Modo GTO Técnico
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: CATÁLOGO COMPLETO DAS 18 AULAS DA SÉRIE REGLIFE */}
      {catalogTab === "series18" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <details open className="lg:col-span-4 rounded-2xl bg-[#090D16] border border-[#1E293B] p-3 group">
            <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-bold text-slate-200 pb-2">
              <span>Aulas ({filteredSeriesLessons.length}) · Spot {String(activeLesson.spotNumber).padStart(2, "0")}</span>
              <span className="text-[0.6875rem] text-[#60A5FA] group-open:hidden">Abrir</span>
              <span className="text-[0.6875rem] text-slate-400 hidden group-open:inline">Recolher</span>
            </summary>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-1 bg-[#05070B] border border-[#1E293B] rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setTranscriptFilter("all")}
                  className={`flex-1 py-1.5 rounded-lg text-[0.6875rem] font-bold transition ${
                    transcriptFilter === "all"
                      ? "bg-[#2563EB] text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todas (18)
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptFilter("verified")}
                  className={`flex-1 py-1.5 rounded-lg text-[0.6875rem] font-bold transition ${
                    transcriptFilter === "verified"
                      ? "bg-[#2563EB] text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Verificadas (15)
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptFilter("unverified")}
                  className={`flex-1 py-1.5 rounded-lg text-[0.6875rem] font-bold transition ${
                    transcriptFilter === "unverified"
                      ? "bg-[#DC2626] text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sem Transcrição (3)
                </button>
              </div>

              <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
                {filteredSeriesLessons.map((lesson) => {
                  const isSelected = lesson.spotNumber === activeLesson.spotNumber;
                  return (
                    <button
                      key={lesson.spotNumber}
                      type="button"
                      onClick={() => setSelectedSpotNumber(lesson.spotNumber)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition ${
                        isSelected
                          ? "bg-[#0F1B33] border-[#3B82F6] text-white"
                          : "bg-[#05070B] border-[#1E293B] text-slate-300 hover:border-[#334155]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">
                          Spot {String(lesson.spotNumber).padStart(2, "0")} — {lesson.moduleLabel}
                        </span>
                        {lesson.hasVerifiedTranscript ? (
                          <span className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-[#0F1B33] text-sky-200 border border-[#2563EB]/50">
                            Analisada
                          </span>
                        ) : (
                          <span className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-[#2B0B11] text-red-200 border border-[#DC2626]/50">
                            Metadados
                          </span>
                        )}
                      </div>
                      <p className="text-[0.6875rem] text-slate-400 mt-1 line-clamp-1">{lesson.title}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </details>

          <div className="lg:col-span-8 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 sm:p-5">
            {renderLessonCard(activeLesson)}
          </div>
        </div>
      )}

      {/* ABA 3: 7 VÍDEOS COMPLEMENTARES */}
      {catalogTab === "supplemental7" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REGLIFE_SUPPLEMENTAL_VIDEOS.map((vid) => (
            <div
              key={vid.videoId}
              className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F1B33] border border-[#2563EB]/50 text-sky-200 text-[0.6875rem] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#60A5FA]" />
                    Transcrição Verificada
                  </span>
                  <a
                    href={vid.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#F87171] hover:text-red-200"
                  >
                    YouTube ({vid.videoId})
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <h4 className="text-sm font-bold text-white">{vid.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{vid.summaryOriginal}</p>

                {vid.timestamps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {vid.timestamps.map((ts, i) => (
                      <a
                        key={i}
                        href={ts.urlWithTimestamp}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0F1B33] border border-[#2563EB]/50 text-[0.6875rem] text-sky-200 hover:bg-[#162647]"
                        title={ts.paraphraseNote}
                      >
                        <Clock className="w-3 h-3" />
                        {ts.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <details className="pt-2 border-t border-[#1E293B] text-xs group">
                <summary className="cursor-pointer list-none font-bold text-[#60A5FA] flex items-center justify-between">
                  <span>Aplicação no TreinerLM &amp; Ressalva</span>
                  <span className="text-[0.6875rem] text-slate-400 group-open:hidden">Abrir</span>
                  <span className="text-[0.6875rem] text-slate-400 hidden group-open:inline">Recolher</span>
                </summary>
                <div className="space-y-2 mt-2">
                  <div className="rounded-lg bg-[#05070B] border border-[#1E293B] p-2.5">
                    <span className="text-[#60A5FA] font-bold block mb-0.5">
                      Aplicação no TreinerLM:
                    </span>
                    <span className="text-slate-200">{vid.softwareTranslation}</span>
                  </div>
                  <div className="rounded-lg bg-[#2B0B11]/60 border border-[#DC2626]/40 p-2.5 text-red-200">
                    <span className="font-bold text-[#F87171]">Ressalva Epistemológica: </span>
                    {vid.epistemicCaveat}
                  </div>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
