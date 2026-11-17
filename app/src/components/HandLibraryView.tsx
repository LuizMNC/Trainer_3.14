"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Download, Search, SlidersHorizontal, Star, Upload } from "lucide-react";
import {
  downloadLocal,
  importLibraryBatch,
  libraryRequest,
  libraryWrite,
  runLatest,
  type BatchResult,
  type LibraryListing,
  type LibrarySummary,
  type StudyMetadata,
} from "@/lib/handLibraryClient";
import { formatAtoms } from "@/lib/poker/handReplay";

const input =
  "w-full rounded-lg border border-[#1E293B] bg-[#05070B] px-3 py-2 text-xs text-[#F8FAFC] outline-none focus:border-[#3B82F6]";
const button =
  "rounded-lg border border-[#1E293B] bg-[#090D16] px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] hover:bg-[#141D2F] disabled:opacity-40 transition";
const primary =
  "rounded-lg border border-[#3B82F6] bg-gradient-to-r from-[#DC2626] to-[#2563EB] px-3.5 py-1.5 text-xs font-extrabold text-white hover:brightness-110 disabled:opacity-40 transition";
const emptyFilters = {
  q: "",
  player: "",
  players: "",
  position: "",
  playedFrom: "",
  playedTo: "",
  importedFrom: "",
  importedTo: "",
  blind: "",
  status: "",
  tag: "",
  favorite: "",
  notes: "",
  pending: "",
  sort: "imported_desc",
};
const statusLabels = {
  IMPORTED: "Importado",
  DUPLICATE: "Duplicado",
  INVALID: "Inválido",
  UNSUPPORTED: "Não suportado",
  ERROR: "Erro de leitura/armazenamento",
};
function stamp(value: string | null) {
  return value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "UTC" }) + " UTC"
    : "Não informada";
}
function binary(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function HandLibraryView({
  onOpenReplay,
  refreshVersion = 0,
}: {
  onOpenReplay: (recordId: string) => void;
  refreshVersion?: number;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [query, setQuery] = useState<Record<string, string>>({
    sort: "imported_desc",
    page: "1",
  });
  const [data, setData] = useState<LibraryListing | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]),
    [selected, setSelected] = useState<LibrarySummary | null>(null);
  const [confirmation, setConfirmation] = useState<{
    item: LibrarySummary;
    kind: "delete" | "clearStudy";
  } | null>(null);
  const gate = useRef({ version: 0 });
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    return runLatest(
      gate.current,
      () => libraryRequest<LibraryListing>({ action: "list", ...query }),
      (result) => setData(result),
      (e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Falha de leitura.");
      },
      () => setLoading(false),
    );
  }, [query]);
  useEffect(() => {
    const controller = gate.current;
    void refresh();
    return () => {
      controller.version++;
    };
  }, [refresh, refreshVersion]);
  async function importFiles(files: File[]) {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      await importLibraryBatch(files, (result) =>
        setResults((old) => [...old, result]),
      );
      setQuery((old) => ({ ...old, page: "1" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importação recusada.");
    } finally {
      setBusy(false);
    }
  }
  async function saveStudy(value: StudyMetadata, markReviewed: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const study = await libraryWrite<StudyMetadata>("study", {
        recordId: selected.recordId,
        study: {
          note: value.note,
          tags: value.tags,
          favorite: value.favorite,
          pending: value.pending,
          markReviewed,
        },
      });
      setSelected({ ...selected, study });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function quickToggleStudy(
    item: LibrarySummary,
    patch: Partial<Pick<StudyMetadata, "favorite" | "pending">>,
  ) {
    setBusy(true);
    setError(null);
    try {
      await libraryWrite<StudyMetadata>("study", {
        recordId: item.recordId,
        study: {
          note: item.study.note,
          tags: item.study.tags,
          favorite: patch.favorite ?? item.study.favorite,
          pending: patch.pending ?? item.study.pending,
          markReviewed: false,
        },
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar marcação.");
    } finally {
      setBusy(false);
    }
  }
  async function removeConfirmed() {
    if (!confirmation) return;
    setBusy(true);
    setError(null);
    try {
      await libraryWrite(confirmation.kind, {
        recordId: confirmation.item.recordId,
        confirm: confirmation.item.recordId,
      });
      setConfirmation(null);
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exclusão recusada.");
    } finally {
      setBusy(false);
    }
  }
  async function exportData(item: LibrarySummary | null, part: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await libraryRequest<{
        content?: string;
        base64?: string;
        format?: string;
      }>({
        action: item ? "export" : "backup",
        ...(item ? { recordId: item.recordId, part } : {}),
      });
      const name = item
        ? item.recordId.slice(0, 24) + "-" + part + "." + (result.format ?? "json")
        : "biblioteca-backup.sqlite3";
      if (result.base64)
        downloadLocal(
          binary(result.base64),
          name,
          "application/octet-stream",
        );
      else if (result.content) downloadLocal(result.content, name);
      else throw new Error("Exportação vazia.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exportação recusada.");
    } finally {
      setBusy(false);
    }
  }
  function field(key: keyof typeof emptyFilters, label: string, type = "text") {
    return (
      <label className="text-xs text-[#94A3B8]" key={key}>
        {label}
        <input
          className={input}
          type={type}
          value={filters[key]}
          onChange={(e) =>
            setFilters((old) => ({ ...old, [key]: e.target.value }))
          }
        />
      </label>
    );
  }
  function select(
    key: keyof typeof emptyFilters,
    label: string,
    options: [string, string][],
  ) {
    return (
      <label className="text-xs text-[#94A3B8]" key={key}>
        {label}
        <select
          aria-label={label}
          className={input}
          value={filters[key]}
          onChange={(e) =>
            setFilters((old) => ({ ...old, [key]: e.target.value }))
          }
        >
          {key !== "sort" && <option value="">Todos</option>}
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <section className="space-y-4" aria-label="Biblioteca de Mãos">
      {/* Cabeçalho Enxuto + Ações Principais */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1E293B] bg-[#090D16] p-4">
        <div>
          <p className="text-[0.6875rem] font-extrabold tracking-widest text-[#60A5FA]">
            ACERVO LOCAL · REVISÃO PÓS-SESSÃO
          </p>
          <h2 className="mt-0.5 flex items-center gap-2 text-lg sm:text-xl font-extrabold text-[#F8FAFC]">
            <BookOpen size={20} className="text-[#60A5FA]" />
            Biblioteca de Mãos
          </h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Importe históricos PHH/JSON, filtre, favorite, marque para revisão ou abra direto no Replayer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={primary + " cursor-pointer flex items-center gap-1.5"}>
            <Upload size={14} />
            Importar arquivos
            <input
              className="sr-only"
              type="file"
              multiple
              accept=".phh,.json"
              aria-label="Importar históricos PHH e JSON"
              disabled={busy}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void importFiles(files);
              }}
            />
          </label>
          <button
            className={button}
            disabled={busy || loading}
            onClick={() => void refresh()}
          >
            Atualizar biblioteca
          </button>
          <button
            className={button}
            disabled={busy || !data}
            onClick={() => void exportData(null, "backup")}
          >
            <Download className="mr-1 inline" size={14} />
            Backup SQLite
          </button>
        </div>
      </header>

      {/* Avisos de processamento ou lote */}
      {busy && (
        <p role="status" className="text-xs font-bold text-[#60A5FA]">
          Processando no backend local…
        </p>
      )}
      {results.length > 0 && (
        <section
          className="rounded-xl border border-[#1E293B] bg-[#090D16] p-3.5"
          aria-label="Resultado do lote"
        >
          <p className="text-xs font-bold text-[#F8FAFC]">
            {Object.entries(statusLabels)
              .map(
                ([key, label]) =>
                  `${label}: ${results.filter((r) => r.status === key).length}`,
              )
              .join(" · ")}
          </p>
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto text-xs">
            {results.map((result, i) => (
              <li key={i} className="rounded-lg bg-[#05070B] border border-[#1E293B] p-2 break-words">
                <strong
                  className={
                    result.status === "IMPORTED"
                      ? "text-[#60A5FA]"
                      : "text-[#F87171]"
                  }
                >
                  {result.name} · {statusLabels[result.status]}
                </strong>
                <p className="text-[#94A3B8]">{result.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#EF4444]/60 bg-[#EF4444]/10 p-3.5 text-xs text-[#FCA5A5] break-words"
        >
          {error}
        </div>
      )}

      {/* Indicadores Rápidos do Acervo */}
      {data && (
        <section aria-label="Indicadores do acervo" className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {[
              ["Total de mãos", data.stats.total],
              ["Completas", data.stats.complete],
              ["Parciais", data.stats.partial],
              ["Favoritos", data.stats.favorites],
              ["Revisão pendente", data.stats.pending],
            ].map(([label, count]) => (
              <div
                key={label}
                className="rounded-xl border border-[#1E293B] bg-[#090D16] px-3.5 py-2.5 flex items-center justify-between"
              >
                <span className="text-xs text-[#94A3B8]">{label}</span>
                <strong className="text-lg font-extrabold font-mono tabular-nums text-[#F8FAFC]">
                  {count}
                </strong>
              </div>
            ))}
          </div>
          <details className="rounded-xl border border-[#1E293B] bg-[#090D16] p-3 text-xs text-[#94A3B8]">
            <summary className="cursor-pointer font-bold text-[#F8FAFC]">
              Ver distribuições do acervo e notas técnicas (PHH_NT_SUBSET_1)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Distribution
                title="Por quantidade de jogadores"
                rows={data.stats.byPlayers}
              />
              <Distribution
                title="Importações por mês UTC · últimos 12 meses com registros"
                rows={data.stats.byImportMonth}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] text-[#94A3B8]">
              Até 20 arquivos / 20 MiB por lote · PHH 1 MiB · JSON 6 MiB · Sem envio a serviços externos. Uma mão válida não é uma solução GTO.
            </p>
          </details>
        </section>
      )}

      {/* Barra de Pesquisa Principal + Filtros Avançados Recolhíveis */}
      <form
        className="rounded-2xl border border-[#1E293B] bg-[#090D16] p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ ...filters, page: "1" });
        }}
        aria-label="Pesquisar e filtrar mãos"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {field("q", "Identificador ou arquivo")}
          {field("player", "Jogador")}
          {select("favorite", "Favorito", [
            ["yes", "Sim"],
            ["no", "Não"],
          ])}
          {select("pending", "Revisão pendente", [
            ["yes", "Sim"],
            ["no", "Não"],
          ])}
          {select("sort", "Ordenar", [
            ["imported_desc", "Importação: recentes"],
            ["imported_asc", "Importação: antigas"],
            ["played_desc", "Data reportada: recentes"],
            ["played_asc", "Data reportada: antigas"],
            ["players", "Participantes"],
            ["identifier", "Identificador reportado"],
          ])}
        </div>

        <details className="rounded-xl border border-[#1E293B] bg-[#05070B] p-3">
          <summary className="cursor-pointer text-xs font-bold text-[#60A5FA] flex items-center gap-1.5">
            <SlidersHorizontal size={13} />
            Filtros avançados (participantes, posição, blinds, datas, tags)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
            {select(
              "players",
              "Participantes",
              Array.from({ length: 8 }, (_, i) => [
                String(i + 2),
                String(i + 2),
              ]),
            )}
            {select(
              "position",
              "Posição conhecida",
              ["SB", "BB", "BTN", "BTN/SB", "UTG", "HJ", "CO"].map((p) => [
                p,
                p,
              ]),
            )}
            {field("blind", "Big blind (ex.: 0.02)")}
            {select("status", "Completa ou parcial", [
              ["VALIDATED_COMPLETE", "Completa"],
              ["VALIDATED_PARTIAL", "Parcial"],
            ])}
            {field("tag", "Tag exata")}
            {select("notes", "Com nota textual", [
              ["yes", "Sim"],
              ["no", "Não"],
            ])}
            {field("playedFrom", "Data da mão: de", "date")}
            {field("playedTo", "Data da mão: até", "date")}
            {field("importedFrom", "Importação UTC: de", "date")}
            {field("importedTo", "Importação UTC: até", "date")}
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <button className={primary} disabled={busy} type="submit">
            <Search size={14} className="mr-1 inline" />
            Aplicar filtros
          </button>
          <button
            className={button}
            type="button"
            disabled={busy}
            onClick={() => {
              setFilters(emptyFilters);
              setQuery({ sort: "imported_desc", page: "1" });
            }}
          >
            Limpar filtros
          </button>
        </div>
      </form>

      {loading && (
        <p role="status" className="text-xs text-[#94A3B8]">
          Consultando o índice local…
        </p>
      )}

      {data && !loading && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#94A3B8]">
            <p>
              {data.total} mãos encontradas · página {data.page} de{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </p>
            <div className="flex gap-2">
              <button
                className={button}
                disabled={data.page === 1 || busy}
                onClick={() =>
                  setQuery((old) => ({ ...old, page: String(data.page - 1) }))
                }
              >
                Página anterior
              </button>
              <button
                className={button}
                disabled={data.page * data.pageSize >= data.total || busy}
                onClick={() =>
                  setQuery((old) => ({ ...old, page: String(data.page + 1) }))
                }
              >
                Próxima página
              </button>
            </div>
          </div>

          {data.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#1E293B] bg-[#090D16] p-8 text-center text-xs text-[#94A3B8]">
              Nenhuma mão encontrada. Importe históricos ou ajuste os filtros.
            </p>
          ) : (
            <div
              className="grid gap-3 xl:grid-cols-2"
              aria-label="Mãos cadastradas"
            >
              {data.items.map((item) => (
                <article
                  key={item.recordId}
                  data-testid="library-hand"
                  data-record-id={item.recordId}
                  className="min-w-0 rounded-2xl border border-[#1E293B] bg-[#090D16] p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <header className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-all text-sm font-bold text-[#F8FAFC]">
                          {item.handId ?? item.recordId}
                        </h3>
                        <p className="break-all text-xs text-[#94A3B8]">
                          {item.fileName ?? "Arquivo não informado"} ·{" "}
                          {item.status === "VALIDATED_COMPLETE"
                            ? "Completa"
                            : "Parcial"}{" "}
                          · {item.playerCount} jogadores · {item.variant}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void quickToggleStudy(item, {
                              favorite: !item.study.favorite,
                            })
                          }
                          className={`px-2 py-1 rounded-lg border text-[0.6875rem] font-bold flex items-center gap-1 ${
                            item.study.favorite
                              ? "bg-[#F59E0B]/20 border-[#F59E0B] text-[#FCD34D]"
                              : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                          }`}
                          title="Alternar favorito"
                        >
                          <Star
                            aria-label={
                              item.study.favorite
                                ? "Mão favorita"
                                : "Favoritar mão"
                            }
                            className={
                              item.study.favorite ? "fill-[#F59E0B]" : ""
                            }
                            size={13}
                          />
                          Favorita
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void quickToggleStudy(item, {
                              pending: !item.study.pending,
                            })
                          }
                          className={`px-2 py-1 rounded-lg border text-[0.6875rem] font-bold ${
                            item.study.pending
                              ? "bg-[#EF4444]/20 border-[#EF4444] text-[#FCA5A5]"
                              : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                          }`}
                        >
                          {item.study.pending ? "Revisar!" : "Revisar"}
                        </button>
                      </div>
                    </header>

                    {/* Resumo visual de Blinds, Board e Jogadores */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                      <span className="rounded bg-[#05070B] border border-[#1E293B] px-2 py-0.5 font-mono text-[#F8FAFC]">
                        Blinds:{" "}
                        {item.blindsAtoms
                          .map((v) => formatAtoms(v, item.decimalPlaces))
                          .join(" / ")}
                      </span>
                      <span className="rounded bg-[#05070B] border border-[#1E293B] px-2 py-0.5 font-mono text-[#60A5FA]">
                        Board: {item.board.join(" ") || "Pré-flop"}
                      </span>
                      {item.study.tags.map((tag) => (
                        <span
                          className="rounded-full bg-[#2563EB]/20 border border-[#3B82F6]/40 px-2 py-0.5 text-sky-200"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.players.map((p, i) => (
                        <span
                          key={i}
                          className="rounded bg-[#05070B] border border-[#1E293B] px-2 py-0.5 text-[0.6875rem] text-[#F8FAFC] break-all"
                        >
                          {p.name ?? p.label} ·{" "}
                          {p.position && p.position !== "OTHER"
                            ? p.position +
                              (p.positionStatus === "INFERRED" ? "*" : "")
                            : "s/ pos"}{" "}
                          ({formatAtoms(p.initialStackAtoms, item.decimalPlaces)})
                        </span>
                      ))}
                    </div>

                    <details className="mt-2 text-[0.6875rem] text-[#94A3B8]">
                      <summary className="cursor-pointer hover:text-white">
                        Detalhes de proveniência, datas e exportação
                      </summary>
                      <dl className="mt-1.5 space-y-1 pl-2 border-l border-[#1E293B]">
                        <div>
                          <dt className="inline text-[#94A3B8]">Proveniência: </dt>
                          <dd className="inline text-[#FCD34D]">
                            {item.provenance === "PHH_RECONSTRUCTED"
                              ? "PHH conferido pelo motor · autoria não autenticada"
                              : "JSON · conferência estrutural; origem não autenticada"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-[#94A3B8]">Data reportada: </dt>
                          <dd className="inline">
                            {item.playedDate ?? "Não informada"}
                            {item.playedTime ? ` · ${item.playedTime}` : ""}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-[#94A3B8]">Importado: </dt>
                          <dd className="inline">{stamp(item.importedAtUtc)}</dd>
                        </div>
                        <div>
                          <dt className="inline text-[#94A3B8]">Última revisão: </dt>
                          <dd className="inline">
                            {stamp(item.study.lastReviewedAtUtc)}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E293B]">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={primary}
                        disabled={busy}
                        onClick={() => onOpenReplay(item.recordId)}
                      >
                        Abrir no Replayer
                      </button>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => setSelected(item)}
                      >
                        Editar estudo
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void exportData(item, "source")}
                      >
                        Original{" "}
                        {item.provenance === "PHH_RECONSTRUCTED" ? "PHH" : "JSON"}
                      </button>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void exportData(item, "canonical")}
                      >
                        Canônico JSON
                      </button>
                      <button
                        className={button + " text-[#FCA5A5] hover:border-[#EF4444]"}
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({ item, kind: "delete" })
                        }
                      >
                        Excluir mão
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <StudyEditor
          key={selected.recordId + selected.study.lastReviewedAtUtc}
          item={selected}
          busy={busy}
          onSave={saveStudy}
          onClose={() => setSelected(null)}
          onClear={() =>
            setConfirmation({ item: selected, kind: "clearStudy" })
          }
        />
      )}

      {confirmation && (
        <section
          role="alertdialog"
          aria-labelledby="library-confirm-title"
          className="rounded-2xl border border-[#EF4444] bg-[#090D16] p-5"
        >
          <h3 id="library-confirm-title" className="font-bold text-white">
            {confirmation.kind === "delete"
              ? "Excluir esta mão e seus metadados?"
              : "Remover todos os metadados de estudo desta mão?"}
          </h3>
          <p className="my-3 break-all text-sm text-[#FCA5A5]">
            {confirmation.item.fileName ?? confirmation.item.recordId} · Esta
            operação não pode ser desfeita pela interface.
            {confirmation.kind === "clearStudy"
              ? " O histórico original será preservado."
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={busy}
              autoFocus
              onClick={() => setConfirmation(null)}
            >
              Cancelar exclusão
            </button>
            <button
              className={button + " bg-[#DC2626] border-[#EF4444] text-white font-extrabold hover:bg-[#B91C1C]"}
              disabled={busy}
              onClick={() => void removeConfirmed()}
            >
              Confirmar exclusão
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#05070B] p-3">
      <h3 className="mb-2 text-xs text-[#94A3B8]">{title}</h3>
      {rows.length ? (
        rows.map((row) => (
          <div
            className="mb-1 flex items-center gap-2 text-xs text-[#F8FAFC]"
            key={row.label}
          >
            <span className="w-16 shrink-0">{row.label}</span>
            <span
              className="h-2 rounded bg-[#2563EB]"
              style={{ width: `${(row.count / max) * 65}%` }}
            />
            <span>{row.count}</span>
          </div>
        ))
      ) : (
        <p className="text-xs text-[#94A3B8]">Sem registros.</p>
      )}
    </div>
  );
}

function StudyEditor({
  item,
  busy,
  onSave,
  onClose,
  onClear,
}: {
  item: LibrarySummary;
  busy: boolean;
  onSave: (study: StudyMetadata, markReviewed: boolean) => Promise<void>;
  onClose: () => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState(item.study),
    [tags, setTags] = useState(item.study.tags.join(", "));
  return (
    <section
      aria-label="Editar estudo da mão"
      className="rounded-2xl border border-[#3B82F6] bg-[#090D16] p-5"
    >
      <h3 className="mb-3 break-all font-bold text-white">
        Estudo · {item.fileName ?? item.recordId}
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(
            {
              ...value,
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            },
            false,
          );
        }}
        className="space-y-3"
      >
        <label className="block text-xs text-[#94A3B8]">
          Nota de estudo
          <textarea
            aria-label="Nota de estudo"
            autoFocus
            className={input}
            rows={4}
            maxLength={5000}
            value={value.note}
            onChange={(e) => setValue({ ...value, note: e.target.value })}
          />
        </label>
        <label className="block text-xs text-[#94A3B8]">
          Tags separadas por vírgula
          <input
            aria-label="Tags separadas por vírgula"
            className={input}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-5 text-xs text-[#F8FAFC]">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={value.favorite}
              onChange={(e) =>
                setValue({ ...value, favorite: e.target.checked })
              }
            />{" "}
            Favorito
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={value.pending}
              onChange={(e) =>
                setValue({ ...value, pending: e.target.checked })
              }
            />{" "}
            Revisão pendente
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={busy}>
            Salvar estudo
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() =>
              void onSave(
                {
                  ...value,
                  tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                },
                true,
              )
            }
          >
            Marcar como revisada
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={onClear}
          >
            Remover metadados de estudo
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={onClose}
          >
            Fechar edição
          </button>
        </div>
      </form>
    </section>
  );
}
