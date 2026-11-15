"use client";

import { useRef, useState } from "react";
import type { ConfidenceLevel } from "@/lib/poker/adaptiveDiagnostics";
import type { FatalErrorCard } from "@/lib/poker/fatalErrorsCatalog";
import { scoreFatalErrorQuiz } from "@/lib/poker/fatalErrorsStudy";

export function FatalErrorQuiz({ card, ready, onAnswer }: {
  card: FatalErrorCard;
  ready: boolean;
  onAnswer: (chosenIndex: number, confidence: ConfidenceLevel, timestamp: number, attemptId: string) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel>("media");
  const [submitted, setSubmitted] = useState(false);
  const submissionLock = useRef(false);
  const result = submitted && chosen !== null ? scoreFatalErrorQuiz(card, chosen) : null;
  return (
    <section className="rounded-xl bg-slate-950 border border-slate-700 p-4 space-y-3" aria-label="Exercício de fixação">
      <h3 className="font-bold text-emerald-200">Fixação conceitual</h3>
      <p className="text-xs text-slate-400">Pergunta editorial baseada no catálogo. A pontuação mede compreensão, sem avaliar uma mão como GTO.</p>
      <fieldset disabled={!ready || submitted} className="space-y-2">
        <legend className="text-sm font-semibold mb-3">{card.quiz.question}</legend>
        {card.quiz.options.map((option, index) => (
          <label key={option} className={`flex gap-3 items-start rounded-lg border p-3 cursor-pointer text-sm ${chosen === index ? "border-emerald-500 bg-emerald-950/30" : "border-slate-800 hover:border-slate-600"}`}>
            <input type="radio" name={card.quiz.id} value={index} checked={chosen === index} onChange={() => setChosen(index)} className="mt-1 accent-emerald-500 shrink-0" />
            <span>{option}</span>
          </label>
        ))}
        <label className="block text-sm pt-2">Confiança antes de responder
          <select className="block w-full sm:w-auto mt-1 bg-slate-900 border border-slate-700 rounded p-2" value={confidence} onChange={e => setConfidence(e.target.value as ConfidenceLevel)}>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
          </select>
        </label>
      </fieldset>
      {!submitted && <button type="button" disabled={!ready || chosen === null} className="px-4 py-2 rounded-lg bg-emerald-700 text-sm font-bold disabled:opacity-40" onClick={() => {
        if (chosen === null || submissionLock.current || !ready) return;
        submissionLock.current = true;
        onAnswer(chosen, confidence, Date.now(), crypto.randomUUID());
        setSubmitted(true);
      }}>Confirmar resposta</button>}
      {result && <div role="status" className={`rounded-lg border p-3 space-y-2 text-sm ${result.isCorrect ? "border-emerald-700 text-emerald-200" : "border-amber-700 text-amber-200"}`}>
        <p className="font-bold">{result.isCorrect ? "Resposta correta." : "Revisar o conceito. A resposta incorreta foi registrada."}</p>
        <p>Resposta esperada: {card.quiz.options[card.quiz.correctIndex]}</p>
        <p>{result.explanation}</p>
        <p className="text-xs text-slate-400">Sem EV loss; o resultado não depende de ganhar ou perder uma mão. Estratégias mistas exigem análise de frequência.</p>
        <button type="button" className="underline font-semibold" onClick={() => { submissionLock.current = false; setSubmitted(false); setChosen(null); }}>Praticar novamente</button>
      </div>}
    </section>
  );
}
