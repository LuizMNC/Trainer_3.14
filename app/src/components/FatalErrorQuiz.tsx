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
    <section className="rounded-xl bg-[#05070B] border border-[#26334A] p-4 space-y-3" aria-label="Exercício de fixação">
      <h3 className="font-bold text-sky-200">Fixação conceitual</h3>
      <p className="text-xs text-slate-400">Pergunta editorial baseada no catálogo. A pontuação mede compreensão, sem avaliar uma mão como GTO.</p>
      <fieldset disabled={!ready || submitted} className="space-y-2">
        <legend className="text-sm font-semibold mb-3">{card.quiz.question}</legend>
        {card.quiz.options.map((option, index) => (
          <label key={option} className={`flex gap-3 items-start rounded-lg border p-3 cursor-pointer text-sm ${chosen === index ? "border-[#3B82F6] bg-[#0F1B33]" : "border-[#1E293B] hover:border-[#334155]"}`}>
            <input type="radio" name={card.quiz.id} value={index} checked={chosen === index} onChange={() => setChosen(index)} className="mt-1 accent-[#2563EB] shrink-0" />
            <span>{option}</span>
          </label>
        ))}
        <label className="block text-sm pt-2">Confiança antes de responder
          <select className="block w-full sm:w-auto mt-1 bg-[#090D16] border border-[#26334A] rounded p-2" value={confidence} onChange={e => setConfidence(e.target.value as ConfidenceLevel)}>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
          </select>
        </label>
      </fieldset>
      {!submitted && <button type="button" disabled={!ready || chosen === null} className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] text-white text-sm font-bold disabled:opacity-40 transition" onClick={() => {
        if (chosen === null || submissionLock.current || !ready) return;
        submissionLock.current = true;
        onAnswer(chosen, confidence, Date.now(), crypto.randomUUID());
        setSubmitted(true);
      }}>Confirmar resposta</button>}
      {result && <div role="status" className={`rounded-lg border p-3 space-y-2 text-sm ${result.isCorrect ? "border-[#2563EB] bg-[#0F1B33]/60 text-sky-200" : "border-[#DC2626] bg-[#2B0B11]/60 text-red-200"}`}>
        <p className="font-bold">{result.isCorrect ? "Resposta correta." : "Revisar o conceito. A resposta incorreta foi registrada."}</p>
        <p>Resposta esperada: {card.quiz.options[card.quiz.correctIndex]}</p>
        <p>{result.explanation}</p>
        <p className="text-xs text-slate-400">Sem EV loss; o resultado não depende de ganhar ou perder uma mão. Estratégias mistas exigem análise de frequência.</p>
        <button type="button" className="underline font-semibold" onClick={() => { submissionLock.current = false; setSubmitted(false); setChosen(null); }}>Praticar novamente</button>
      </div>}
    </section>
  );
}
