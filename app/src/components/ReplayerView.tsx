"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, ChevronLeft, ChevronRight, Clapperboard, Upload } from "lucide-react";
import examples from "@/data/replayExamples.json";
import { parseCard } from "@/lib/poker/cards";
import type { CanonicalHand } from "@/lib/poker/handHistorySchema";
import { MAX_REPLAY_JSON_BYTES, parseCanonicalHandText } from "@/lib/poker/handHistoryValidation";
import { buildReplayFrame, formatAtoms, INITIAL_PLAYBACK, playbackTransition, replayEventLabel, replayPlayerName, STREET_LABELS, type PlaybackAction, type ReplayPerspective } from "@/lib/poker/handReplay";
import styles from "./ReplayerView.module.css";
import {
  libraryRequest,
  libraryWrite,
  readLibraryReplay,
  runLatest,
  type LibraryListing,
  type StudyMetadata,
} from "@/lib/handLibraryClient";
import {replayToLab,type LabScenario} from "@/lib/poker/labTransfer";

interface LoadedHand {
  hand: CanonicalHand;
  label: string;
  kind: "example"|"local"|"library-phh"|"library-json";
  key: number;
  libraryRecordId?: string;
}

function ReplayCard({ code, dealt = true }: { code: string|null; dealt?: boolean }) {
  if (!code) return <span className={`${styles.card} ${styles.cardBack}`} aria-label={dealt ? "Carta oculta ou desconhecida" : "Carta não distribuída"}>{dealt ? "♠" : "—"}</span>;
  const card = parseCard(code);
  const suitBg = card.suit === "♥" ? "#C83E3E" : card.suit === "♦" ? "#2563EB" : card.suit === "♣" ? "#2E8B57" : "#26292B";
  return <span className={styles.card} style={{ backgroundColor: suitBg, color: "#FFFFFF", borderColor: "rgba(255,255,255,0.22)" }} aria-label={code}><strong>{card.rank}</strong><span>{card.suit}</span></span>;
}

export function ReplayerView({
  librarySelection,
  onLibraryStudyChanged,
  onSendToLab,
}: {
  librarySelection?:{recordId:string;requestKey:number}|null;
  onLibraryStudyChanged?:()=>void;
  onSendToLab?:(scenario:LabScenario)=>void;
}) {
  const [loaded,setLoaded] = useState<LoadedHand|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [exampleId,setExampleId] = useState(examples[0].id);
  const request = useRef({version:0});

  const loadExample = useCallback(async (id: string) => {
    setLoading(true); setLoaded(null); setError(null); setExampleId(id);
    await runLatest(request.current,async()=>{
      const example = examples.find(e=>e.id===id);
      if (!example) throw new Error("Exemplo local inexistente.");
      const response = await fetch(example.path,{cache:"no-store"});
      if (!response.ok) throw new Error("Não foi possível ler o exemplo local.");
      const raw = await response.text();
      const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
      const hash = [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
      if (hash!==example.canonicalSha256) throw new Error("O exemplo difere da cópia gerada pelo pipeline.");
      const hand = parseCanonicalHandText(raw);
      if (hand.source.sha256!==example.sourceSha256) throw new Error("Proveniência do exemplo incompatível com o catálogo local.");
      return {hand,label:example.label,kind:"example" as const};
    },(value,key)=>setLoaded({...value,key}),e=>setError(e instanceof Error ? e.message : "Não foi possível carregar a mão."),()=>setLoading(false));
  },[]);

  const loadLibrary = useCallback(async (recordId:string)=>{
    setLoading(true);setLoaded(null);setError(null);setExampleId("");
    await runLatest(
      request.current,
      ()=>readLibraryReplay(recordId),
      (result,key)=>setLoaded({
        hand:result.hand,
        label:result.fileName||result.recordId,
        kind:result.provenance==="PHH_RECONSTRUCTED"?"library-phh":"library-json",
        key,
        libraryRecordId:result.recordId,
      }),
      e=>setError(e instanceof Error?e.message:"Não foi possível abrir a mão da Biblioteca."),
      ()=>setLoading(false),
    );
  },[]);

  useEffect(()=>{
    let active=true;
    const controller=request.current;
    queueMicrotask(()=>{if (active) {if(librarySelection)void loadLibrary(librarySelection.recordId);else void loadExample(examples[0].id);}});
    return ()=>{active=false;controller.version++;};
  },[loadExample,loadLibrary,librarySelection]);

  async function loadFile(file: File) {
    setLoading(true);setLoaded(null);setError(null);setExampleId("");
    await runLatest(request.current,async()=>{
      if (file.size>MAX_REPLAY_JSON_BYTES) throw new Error("Arquivo acima do limite de 6 MiB.");
      const hand = parseCanonicalHandText(await file.text());
      return {hand,label:file.name,kind:"local" as const};
    },(value,key)=>setLoaded({...value,key}),e=>setError(e instanceof Error ? e.message : "JSON recusado."),()=>setLoading(false));
  }

  return <section className={styles.root} aria-label="Replayer de mãos">
    <header className={styles.heading}><div><p className={styles.eyebrow}>REVISÃO PÓS-SESSÃO</p><h2><Clapperboard size={22}/> Replayer</h2><p>Explore a sequência registrada, um evento de cada vez.</p></div><span className={styles.badge}>Estudo offline · sem avaliação estratégica</span></header>
    <div className={styles.sourceBar}>
      <label>Exemplo do pipeline<select aria-label="Exemplo do pipeline" value={exampleId} disabled={loading} onChange={e=>void loadExample(e.target.value)}><option value="" disabled>Escolha um exemplo</option>{examples.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
      <label className={styles.upload}><Upload size={16}/><span>Abrir JSON local</span><input type="file" accept=".json,application/json" aria-label="Abrir JSON canônico local" disabled={loading} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file) void loadFile(file);}}/></label>
      <p>Leitura no navegador. O arquivo escolhido não é enviado a serviços.</p>
    </div>
    {loading && <p className={styles.notice} role="status">Conferindo o histórico…</p>}
    {error && <div className={styles.error} role="alert"><strong>Histórico recusado</strong><p>{error}</p><p>Selecione um exemplo ou um JSON canônico do pipeline 2A.</p></div>}
    {loaded && (
      <ReplaySession
        key={loaded.key}
        loaded={loaded}
        onLibraryStudyChanged={onLibraryStudyChanged}
        onSendToLab={onSendToLab}
      />
    )}
  </section>;
}

function ReplaySession({
  loaded,
  onLibraryStudyChanged,
  onSendToLab,
}:{
  loaded:LoadedHand;
  onLibraryStudyChanged?:()=>void;
  onSendToLab?:(scenario:LabScenario)=>void;
}) {
  const {hand}=loaded;
  const [playback,setPlayback] = useState(INITIAL_PLAYBACK);
  const [perspective,setPerspective] = useState<ReplayPerspective>({kind:"public"});
  const [markedForReview,setMarkedForReview] = useState(false);
  const [syncStatus,setSyncStatus] = useState<string|null>(null);
  const [libraryStudy,setLibraryStudy] = useState<StudyMetadata|null>(null);

  useEffect(()=>{
    let active = true;
    const recordId = loaded.libraryRecordId;
    if (recordId) {
      void libraryRequest<LibraryListing>({action:"list",q:recordId,pageSize:"10"})
        .then((listing)=>{
          if (!active) return;
          const match = listing.items.find((it)=>it.recordId===recordId);
          if (match) {
            setLibraryStudy(match.study);
            setMarkedForReview(match.study.pending);
          }
        })
        .catch(()=>{});
    }
    try {
      const raw = window.localStorage.getItem("poker_replayer_marked_hands_v1");
      if (raw && !recordId) {
        const list = JSON.parse(raw) as string[];
        queueMicrotask(() => {
          if (active) setMarkedForReview(Array.isArray(list) && list.includes(hand.recordId));
        });
      }
    } catch {
      // Ignora erro local
    }
    return ()=>{ active = false; };
  },[hand.recordId, loaded.libraryRecordId]);

  const toggleMarkForReview = async () => {
    const next = !markedForReview;
    setMarkedForReview(next);
    setSyncStatus(null);
    try {
      const raw = window.localStorage.getItem("poker_replayer_marked_hands_v1");
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const updated = next ? Array.from(new Set([...list, hand.recordId])) : list.filter(id => id !== hand.recordId);
      window.localStorage.setItem("poker_replayer_marked_hands_v1", JSON.stringify(updated));
    } catch {
      // Ignora erro local
    }
    if (loaded.libraryRecordId) {
      try {
        const listing = await libraryRequest<LibraryListing>({
          action:"list",
          q:loaded.libraryRecordId,
          pageSize:"10",
        });
        const currentStudy =
          listing.items.find((it)=>it.recordId===loaded.libraryRecordId)?.study ??
          libraryStudy ??
          {note:"",tags:[],favorite:false,pending:false,lastReviewedAtUtc:null};
        const saved = await libraryWrite<StudyMetadata>("study",{
          recordId:loaded.libraryRecordId,
          study:{
            note:currentStudy.note,
            tags:currentStudy.tags,
            favorite:currentStudy.favorite,
            pending:next,
            markReviewed:false,
          },
        });
        setLibraryStudy(saved);
        setMarkedForReview(saved.pending);
        setSyncStatus(saved.pending ? "Sincronizado com Biblioteca (Revisão pendente)" : "Sincronizado com Biblioteca (Revisão removida)");
        onLibraryStudyChanged?.();
      } catch {
        setSyncStatus("Salvo apenas localmente no navegador (SQLite indisponível).");
      }
    }
  };
  const count=hand.events.length;
  const dispatch = useCallback((action:PlaybackAction)=>setPlayback(state=>playbackTransition(state,action,count)),[count]);
  useEffect(()=>{
    if (!playback.playing) return;
    const timer=window.setTimeout(()=>dispatch({type:"tick"}),playback.delayMs);
    return ()=>window.clearTimeout(timer);
  },[playback.playing,playback.cursor,playback.delayMs,dispatch]);
  const frame=useMemo(()=>buildReplayFrame(hand,playback.cursor,perspective),[hand,playback.cursor,perspective]);
  const event=frame.event;
  const scale=hand.amountPolicy.decimalPlaces;
  const fmt=(value:string|bigint)=>formatAtoms(value,scale);
  const currency=hand.amountPolicy.currency.status==="MISSING" ? "unidades da fonte" : hand.amountPolicy.currency.value;
  const actor=event?.playerIndex!==null && event?.playerIndex!==undefined ? replayPlayerName(hand,event.playerIndex) : event?.origin==="PHH" ? "Dealer / fonte" : "Motor";
  const activeListItem=useRef<HTMLButtonElement|null>(null);
  const list=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const item=activeListItem.current, container=list.current;
    if (!item||!container) return;
    const row=item.getBoundingClientRect(), bounds=container.getBoundingClientRect();
    if (row.top<bounds.top) container.scrollTop-=bounds.top-row.top;
    else if (row.bottom>bounds.bottom) container.scrollTop+=row.bottom-bounds.bottom;
  },[playback.cursor]);
  const selectedPerspective=perspective.kind==="player" ? `player:${perspective.playerIndex}` : perspective.kind;
  const goto=(cursor:number)=>dispatch({type:"goto",cursor});

  function seat(index:number) {
    const player=hand.players[index];
    const phase=2*Math.PI*index/hand.players.length;
    const current=event?.playerIndex===index;
    const waiting=frame.snapshot.actorIndex===index;
    const position=player.position.status==="MISSING" || player.position.value==="OTHER" ? null : player.position.value;
    return <article key={index} data-testid={`replay-player-${index}`} className={`${styles.seat} ${hand.players.length===2 ? styles.headsUpSeat : ""} ${current ? styles.acted : ""} ${waiting ? styles.waiting : ""} ${frame.snapshot.folded[index] ? styles.folded : ""}`} style={{"--seat-x":`${50+41*Math.sin(phase)}%`,"--seat-y":`${50+34*Math.cos(phase)}%`} as React.CSSProperties}>
      <div className={styles.playerLine}><strong title={replayPlayerName(hand,index)}>{replayPlayerName(hand,index)}</strong>{(position==="BTN"||position==="BTN/SB") && <span className={styles.dealer} aria-label="Dealer button inferido da posição">D</span>}</div>
      <div className={styles.position}>{player.sourceLabel}{position ? ` · ${position}${player.position.status==="INFERRED" ? "*" : ""}` : " · posição não informada"}{player.seat.status!=="MISSING" ? ` · assento ${player.seat.value}` : ""}</div>
      <div className={styles.holeCards}>{frame.visibleCards[index].map((c,i)=><ReplayCard key={i} code={c} dealt={frame.dealt[index]}/>)}</div>
      <div className={styles.stack}><span>Stack</span><strong data-testid={`stack-${index}`}>{fmt(frame.snapshot.stacksAtoms[index])}</strong></div>
      <div className={styles.bet}>Aposta pendente <b>{fmt(frame.snapshot.betsAtoms[index])}</b></div>
      <div className={styles.playerStatus}>{frame.snapshot.folded[index] ? "Fold" : frame.snapshot.mucked[index] ? "Muck" : frame.snapshot.allIn[index] ? "All-in" : waiting ? "A agir" : frame.publicCards[index] ? "Cartas reveladas" : "Em revisão"}</div>
    </article>;
  }

  const split=Math.ceil(hand.players.length/2);
  return <div>
    <div className={styles.handHeader}><div><strong>{loaded.label}</strong><p className={styles.provenance}>{loaded.kind==="example" ? "Exemplo sintético · cópia gerada pelo pipeline e hash conferido" : loaded.kind==="library-phh" ? "Biblioteca · PHH reconstruído pelo motor; autoria não autenticada" : "Arquivo local / Biblioteca JSON · estrutura conferida; origem não autenticada"}</p></div><span className={`${styles.badge} ${!hand.results.complete ? styles.partial : ""}`}>{hand.results.complete ? "Mão completa na fonte" : "Prefixo parcial · sem resultado final"}</span></div>
    <div className={styles.perspective}>
      {onSendToLab&&<button type="button" onClick={()=>{dispatch({type:"pause"});onSendToLab(replayToLab(hand,frame));}}>Enviar cenário ao Laboratório</button>}
      <button type="button" onClick={() => void toggleMarkForReview()} aria-pressed={markedForReview} style={{border:"1px solid #26334A",borderRadius:"8px",padding:"8px 12px",background:markedForReview?"#2563EB25":"#090D16",color:markedForReview?"#93C5FD":"#F8FAFC",fontSize:"0.75rem",fontWeight:700}}>{markedForReview ? "★ Marcada para revisão" : "☆ Marcar para revisão"}</button>
      {syncStatus && <span className="text-[0.6875rem] text-[#93C5FD]" role="status">{syncStatus}</span>}
      <label>Perspectiva<select aria-label="Perspectiva" value={selectedPerspective} onChange={e=>{dispatch({type:"pause"});const value=e.target.value;setPerspective(value.startsWith("player:") ? {kind:"player",playerIndex:Number(value.slice(7))} : value==="recorded" ? {kind:"recorded"} : {kind:"public"});}}><option value="public">Visão pública</option>{hand.players.map(p=><option key={p.index} value={`player:${p.index}`}>Jogador: {replayPlayerName(hand,p.index)}</option>)}<option value="recorded">Visão completa pós-sessão</option></select></label>
      <p>{perspective.kind==="public" ? "Cartas privadas ficam ocultas até a revelação pública." : perspective.kind==="player" ? "Mostra suas cartas conhecidas após a distribuição, além das revelações públicas." : "Todas as cartas conhecidas na fonte até este evento. Essa informação não era necessariamente pública."}</p>
    </div>
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.tableMeta}><span>SB <b>{fmt(hand.table.rawBlindsAtoms[0])}</b> · BB <b>{fmt(hand.table.rawBlindsAtoms[1])}</b></span><span>Antes (configuração PHH): {hand.table.rawAntesAtoms.map(fmt).join(" / ")}</span><span>{currency} · escala {scale}</span></div>
        <div className={styles.table} data-testid="replay-frame" data-cursor={frame.cursor} data-player-count={hand.players.length}>
          <div className={styles.felt}/>
          {Array.from({length:split},(_,i)=>seat(i))}
          <div className={styles.center}>
            <p className={styles.street}>{STREET_LABELS[frame.snapshot.street]}{frame.showdown ? " · showdown registrado" : ""}</p>
            <div className={styles.board} aria-label="Board do evento atual">{frame.snapshot.board.length ? frame.snapshot.board.map(c=><ReplayCard key={c} code={c}/>) : <span className={styles.emptyBoard}>Board ainda não distribuído</span>}</div>
            <div className={styles.pot}><span>POTE TOTAL</span><strong data-testid="replay-pot">{fmt(frame.snapshot.potAtoms)}</strong></div>
            <span className={styles.potHint}>Inclui apostas pendentes</span>
          </div>
          {Array.from({length:hand.players.length-split},(_,i)=>seat(i+split))}
        </div>
        <p className={styles.tableNote}>Distribuição visual relativa à ordem PHH. * Posição inferida da fonte. Assentos físicos aparecem somente quando informados.</p>
        <div className={styles.controls}>
          <div className={styles.transport}><button type="button" aria-label="Voltar ao início" onClick={()=>goto(0)} disabled={frame.cursor===0}><SkipBack size={18}/></button><button type="button" aria-label="Evento anterior" onClick={()=>goto(frame.cursor-1)} disabled={frame.cursor===0}><ChevronLeft size={20}/></button><button type="button" className={styles.play} aria-label={playback.playing ? "Pausar" : "Reproduzir"} disabled={frame.atEnd} onClick={()=>dispatch({type:playback.playing ? "pause" : "play"})}>{playback.playing ? <Pause size={18}/> : <Play size={18}/>}<span>{playback.playing ? "Pausar" : "Reproduzir"}</span></button><button type="button" aria-label="Próximo evento" onClick={()=>goto(frame.cursor+1)} disabled={frame.atEnd}><ChevronRight size={20}/></button><button type="button" aria-label="Ir ao final" onClick={()=>goto(count)} disabled={frame.atEnd}><SkipForward size={18}/></button></div>
          <label className={styles.speed}>Velocidade<select aria-label="Velocidade de reprodução" value={playback.delayMs} onChange={e=>dispatch({type:"speed",delayMs:Number(e.target.value)})}><option value={2000}>0,5× · 2 s</option><option value={1000}>1× · 1 s</option><option value={500}>2× · 0,5 s</option></select></label>
          <label className={styles.progress}><span data-testid="replay-progress">{frame.cursor===0 ? "Início" : `Evento ${frame.cursor} de ${count}`}{frame.atEnd ? hand.results.complete ? " · fim da mão" : " · fim do trecho parcial" : ""}</span><input aria-label="Progresso da mão" type="range" min={0} max={count} value={frame.cursor} onChange={e=>goto(Number(e.target.value))}/></label>
        </div>
        {frame.completed && <section className={styles.settlement} aria-label="Liquidação registrada"><h3>Potes liquidados na fonte</h3>{hand.pots.map((pot,i)=><div key={pot.index}><strong>{i===0 ? "Principal" : `Lateral ${i}`}: {fmt(pot.amountAtoms)}</strong><span>Elegíveis: {pot.eligiblePlayerIndices.map(p=>replayPlayerName(hand,p)).join(", ")}</span><span>{pot.awardsAtoms.map((value,p)=>BigInt(value)>0n ? `${replayPlayerName(hand,p)} recebeu ${fmt(value)}` : "").filter(Boolean).join(" · ")}</span></div>)}</section>}
        {!frame.completed && <p className={styles.notice}>{frame.atEnd ? "O histórico termina neste ponto e não informa um resultado final." : "A composição final dos potes será exibida somente ao concluir uma mão completa."}</p>}
      </div>
      <aside className={styles.aside}>
        <section className={styles.explanation} aria-label="Explicação do evento"><div className={styles.eventTag}>{!event ? "ESTADO INICIAL" : event.origin==="PHH" ? "REGISTRO DA FONTE" : "OPERAÇÃO AUTOMÁTICA"}</div><h3>{replayEventLabel(event)}</h3>{event && <p>{actor}{event.amountAtoms!==null ? ` · ${fmt(event.amountAtoms)} ${currency}` : ""}</p>}
          {event?.kind==="CompletionBettingOrRaisingTo" && <p>O valor da ação é o alvo total nesta street. O incremento pago está indicado abaixo.</p>}
          {event?.kind==="UncollectedBetReturn" && <p>Classificação da aposta não paga. O crédito físico aparece na coleta das fichas; este registro não adiciona um segundo crédito.</p>}
          {event?.kind==="ChipsPushing" && <p>Prêmio destinado no pote. O stack é atualizado no evento de crédito das fichas.</p>}
          {event?.kind==="BetCollection" && <p>Apostas passam à coleta do motor; somente o excesso devolvido aumenta o stack. O pote total já incluía essas apostas.</p>}
          {event?.kind==="HoleDealing" && <p>Duas cartas privadas distribuídas. A perspectiva escolhida controla sua visibilidade.</p>}
          {event && hand.players.map((p,i)=>{
            const delta=BigInt(event.after.stacksAtoms[i])-BigInt(event.before.stacksAtoms[i]);
            const movements=[BigInt(event.paidAtoms[i]) ? `Contribuiu ${fmt(event.paidAtoms[i])}` : "",BigInt(event.returnedAtoms[i]) ? `Devolução ${fmt(event.returnedAtoms[i])}` : "",BigInt(event.awardedAtoms[i]) ? `Prêmio ${fmt(event.awardedAtoms[i])}` : "",delta ? `Stack ${delta>0n ? "+" : ""}${fmt(delta)}` : ""].filter(Boolean);
            return movements.length ? <div className={styles.movement} key={p.index}><strong>{replayPlayerName(hand,i)}</strong><span>{movements.join(" · ")}</span></div> : null;
          })}
          <details><summary>Contribuições até este evento</summary>{hand.players.map((p,i)=><p key={p.index}>{replayPlayerName(hand,i)}: líquida {fmt(frame.contributionsAtoms[i])} · devolução {fmt(frame.returnedAtoms[i])} · prêmio destinado {fmt(frame.awardsAtoms[i])}</p>)}</details>
        </section>
        <section className={styles.timeline} aria-label="Lista cronológica de eventos"><div className={styles.timelineTitle}><h3>Sequência da mão</h3><span>{count} eventos</span></div><div className={styles.eventList} ref={list}><button type="button" className={frame.cursor===0 ? styles.selectedEvent : ""} aria-current={frame.cursor===0 ? "step" : undefined} onClick={()=>goto(0)}>00 · Início da mão</button>{hand.events.map((e,i)=><button type="button" ref={frame.cursor===i+1 ? activeListItem : undefined} key={e.sequence} aria-label={`Selecionar evento ${i+1}: ${replayEventLabel(e)}`} aria-current={frame.cursor===i+1 ? "step" : undefined} className={`${frame.cursor===i+1 ? styles.selectedEvent : ""} ${e.origin==="RULE_DERIVED" ? styles.derivedEvent : ""}`} onClick={()=>goto(i+1)}><span className={styles.eventNumber}>{String(i+1).padStart(2,"0")}</span><span><strong>{replayEventLabel(e)}</strong><small>{e.playerIndex!==null ? replayPlayerName(hand,e.playerIndex) : e.origin==="PHH" ? "Dealer / fonte" : "Motor"} · {e.origin==="PHH" ? "Fonte PHH" : "Automático"}</small></span></button>)}</div></section>
      </aside>
    </div>
  </div>;
}
