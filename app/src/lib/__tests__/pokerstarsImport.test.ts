import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { GET, POST } from "../../app/api/hand-library/route.ts";
import { validateCanonicalHand } from "../poker/handHistoryValidation.ts";
import { buildReplayFrame, replayPlayerName } from "../poker/handReplay.ts";
import type { CanonicalHand } from "../poker/handHistorySchema.ts";

const PT_MTT_HAND = `Mão PokerStars #2626400001: Torneio #9001001, $2.20+$2.20+$0.50 USD Hold'em No Limit - Nível III (25/50) - 2026/11/10 19:30:00 BRT [2026/11/10 17:30:00 ET]
Mesa '9001001 1' 8-max Lugar #3 é o botão
Lugar 1: Alice (1500 em fichas, Bounty de $2.20)
Lugar 2: Bruno (1500 em fichas, Bounty de $2.20)
Lugar 3: Hero (1200 em fichas, Bounty de $2.20)
Alice: coloca ante 5
Bruno: coloca ante 5
Hero: coloca ante 5
Alice: paga o small blind 25
Bruno: paga o big blind 50
*** CARTAS DA MÃO ***
Hero recebe [As Kd]
Hero: aumenta 75 para 125
Alice: desiste
Bruno: iguala 75
*** FLOP *** [Ah 7c 2d]
Bruno: passa
Hero: aposta 150
Bruno: aumenta 300 para 450
Hero: iguala 300
*** TURN *** [Ah 7c 2d] [Ks]
Bruno: passa
Hero: aposta 620 e está all-in
Bruno: desiste
Aposta não-igualada (620) voltou para Hero
Hero recebeu 1190 do pote
Hero: não mostra a mão
*** SUMÁRIO ***
Total pote 1190 | comissão 0
Board [Ah 7c 2d Ks]
Lugar 1: Alice (small blind) desistiu antes do Flop (não apostou)
Lugar 2: Bruno (big blind) desistiu no Turn
Lugar 3: Hero (botão) arrecadou (1190)
`;

const EN_SIDEPOT_MTT = `PokerStars Hand #2626400002: Tournament #9001001, $2.20+$2.20+$0.50 USD Hold'em No Limit - Level IV (50/100) - 2026/11/10 19:40:00 ET
Table '9001001 2' 8-max Seat #1 is the button
Seat 1: Hero (2000 in chips, $2.20 bounty)
Seat 2: Shorty (310 in chips, $2.20 bounty)
Seat 3: Mid (810 in chips, $2.20 bounty)
Shorty: posts the ante 10
Mid: posts the ante 10
Hero: posts the ante 10
Shorty: posts small blind 50
Mid: posts big blind 100
*** HOLE CARDS ***
Dealt to Hero [Qs Qh]
Hero: raises 700 to 800
Shorty: calls 250 and is all-in
Mid: calls 700 and is all-in
Uncalled bet (0) returned to Hero
*** FLOP *** [Qc 5d 2s]
*** TURN *** [Qc 5d 2s] [9h]
*** RIVER *** [Qc 5d 2s 9h] [Jd]
*** SHOW DOWN ***
Mid: shows [Ad Kd] (a pair of Queens - missing straight)
Hero: shows [Qs Qh] (three of a kind, Queens)
Hero collected 1000 from side pot
Shorty: shows [Ac 8c] (high card Ace)
Hero collected 930 from main pot
Shorty finished the tournament in 18th place
Hero wins $1.10 for eliminating Shorty and their own bounty increases by $1.10 to $3.30
*** SUMMARY ***
Total pot 1930 Main pot 930. Side pot 1000. | Rake 0
Board [Qc 5d 2s 9h Jd]
Seat 1: Hero (button) showed [Qs Qh] and won (1930) with three of a kind, Queens
Seat 2: Shorty (small blind) showed [Ac 8c] and lost
Seat 3: Mid (big blind) showed [Ad Kd] and lost
`;

const THREE_MAX_UNKNOWN = `PokerStars Hand #2626400003: Tournament #9002002, $1.80+$0.20 USD Hold'em No Limit - Level I (10/20) - 2026/11/10 18:00:00 ET
Table '9002002 1' 3-max Seat #1 is the button
Seat 1: P1 (500 in chips)
Seat 2: P2 (500 in chips)
Seat 3: P3 (500 in chips)
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Dealt to P1 [Jh Js]
P1: folds
P2: calls 10
P3: checks
*** FLOP *** [4d 5h 9c]
P2: checks
P3: checks
*** TURN *** [4d 5h 9c] [2s]
P2: checks
P3: checks
*** RIVER *** [4d 5h 9c 2s] [Kd]
P2: checks
P3: checks
*** SHOW DOWN ***
P2: shows [7c 8c] (high card King)
P3: shows [Ah 6d] (high card Ace)
P3 collected 40 from pot
*** SUMMARY ***
Total pot 40 | Rake 0
Board [4d 5h 9c 2s Kd]
Seat 1: P1 (button) folded before Flop (didn't bet)
Seat 2: P2 (small blind) showed [7c 8c] and lost
Seat 3: P3 (big blind) showed [Ah 6d] and won (40)
`;

const PHH_BODY = `variant = "NT"
ante_trimming_status = false
antes = [0, 0]
blinds_or_straddles = [50, 100]
min_bet = 100
starting_stacks = [1000, 1000]
actions = ["d dh p1 ????", "d dh p2 ????", "p1 f"]
players = ["A", "B"]
`;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZipBuffer(entries: readonly { name: string; data: string | Uint8Array }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const raw = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);

    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function localRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      "X-Poker-Library": "local-v1",
      ...(init?.headers ?? {}),
    },
  });
}

test("Route /api/hand-library suporta analyzeBatch/commitBatch ZIP/TXT, filtros, estudo e replayer PokerStars", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "treinerlm-ps-"));
  const dbPath = join(tempDir, "ps-library.sqlite3");
  const prevEnabled = process.env.POKER_LIBRARY_ENABLED;
  const prevDb = process.env.POKER_LIBRARY_DATABASE;
  process.env.POKER_LIBRARY_ENABLED = "1";
  process.env.POKER_LIBRARY_DATABASE = dbPath;

  try {
    const zipBuf = makeZipBuffer([
      { name: "pt.txt", data: PT_MTT_HAND },
      { name: "en.txt", data: EN_SIDEPOT_MTT },
    ]);

    const filesPayload = [
      { name: "sessao.zip", format: "zip", base64: zipBuf.toString("base64") },
      { name: "mesa3max.txt", format: "txt", base64: Buffer.from(THREE_MAX_UNKNOWN, "utf8").toString("base64") },
      { name: "phh_errado.txt", format: "txt", base64: Buffer.from(PHH_BODY, "utf8").toString("base64") },
      { name: "ps_errado.phh", format: "phh", base64: Buffer.from(PT_MTT_HAND, "utf8").toString("base64") },
    ];

    // 1. Pré-análise sem criar SQLite no disco
    const analyzeRes = await POST(
      localRequest("http://127.0.0.1:3000/api/hand-library?action=analyzeBatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesPayload, stream: false }),
      }),
    );
    assert.equal(analyzeRes.status, 200);
    const analyzeJson = (await analyzeRes.json()) as {
      ok: boolean;
      data: {
        validHands: number;
        problemHands: number;
        totalToImport: number;
        formatsDetected: Record<string, number>;
        languagesDetected: Record<string, number>;
        issueCodeCounts: Record<string, number>;
      };
    };
    assert.equal(analyzeJson.ok, true);
    assert.equal(existsSync(dbPath), false);
    assert.equal(analyzeJson.data.validHands, 3);
    assert.equal(analyzeJson.data.problemHands, 2);
    assert.equal(analyzeJson.data.totalToImport, 3);
    assert.equal(analyzeJson.data.formatsDetected.MTT, 2);
    assert.equal(analyzeJson.data.formatsDetected.UNKNOWN, 1);
    assert.equal(analyzeJson.data.languagesDetected["pt-BR"], 1);
    assert.equal(analyzeJson.data.languagesDetected.en, 2);
    assert.equal(analyzeJson.data.issueCodeCounts.FORMAT_MISMATCH, 2);

    // 2. Confirmação via streaming NDJSON em tempo real
    const commitRes = await POST(
      localRequest("http://127.0.0.1:3000/api/hand-library?action=commitBatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesPayload, stream: true }),
      }),
    );
    assert.equal(commitRes.status, 200);
    const ndjsonText = await commitRes.text();
    const lines = ndjsonText
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { event?: string; ok?: boolean; data?: { importedHands?: number } });
    const progressEvents = lines.filter((l) => l.event === "progress");
    const doneEvent = lines.find((l) => l.event === "done");
    assert.ok(progressEvents.length >= 1);
    assert.ok(doneEvent?.ok);
    assert.equal(doneEvent?.data?.importedHands, 3);
    assert.equal(existsSync(dbPath), true);

    // 3. Listagem com filtros de torneio, modalidade e busca livre
    const mttListRes = await GET(localRequest("http://127.0.0.1:3000/api/hand-library?action=list&format=MTT&tournament=9001001"));
    const mttList = (await mttListRes.json()) as {
      ok: boolean;
      data: { total: number; items: { recordId: string; handId: string }[]; stats: { tournaments: { tournamentId: string }[] } };
    };
    assert.equal(mttList.data.total, 2);
    assert.ok(mttList.data.stats.tournaments.some((t) => t.tournamentId === "9001001"));

    const unkListRes = await GET(localRequest("http://127.0.0.1:3000/api/hand-library?action=list&format=UNKNOWN"));
    const unkList = (await unkListRes.json()) as { ok: boolean; data: { total: number; items: { recordId: string }[] } };
    assert.equal(unkList.data.total, 1);

    // 4. Salva anotação de estudo e reimporta duplicado -> preserva nota sem duplicar
    const sidepotItem = mttList.data.items.find((i) => i.handId === "2626400002")!;
    assert.ok(sidepotItem);
    const studyRes = await POST(
      localRequest("http://127.0.0.1:3000/api/hand-library?action=study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: sidepotItem.recordId,
          study: { note: "All-in triplo validado", favorite: true, pending: true, tags: ["sidepot"], markReviewed: false },
        }),
      }),
    );
    assert.equal(studyRes.status, 200);

    const dupCommit = await POST(
      localRequest("http://127.0.0.1:3000/api/hand-library?action=commitBatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [{ name: "sessao.zip", format: "zip", base64: zipBuf.toString("base64") }], stream: false }),
      }),
    );
    const dupJson = (await dupCommit.json()) as { ok: boolean; data: { importedHands: number; duplicates: number } };
    assert.equal(dupJson.data.importedHands, 0);
    assert.equal(dupJson.data.duplicates, 2);

    // 5. Leitura + validateCanonicalHand + Replayer (cartas ocultas vs gravadas)
    const readRes = await GET(localRequest("http://127.0.0.1:3000/api/hand-library?action=read&recordId=" + encodeURIComponent(sidepotItem.recordId)));
    const readJson = (await readRes.json()) as { ok: boolean; data: { provenance: string; hand: CanonicalHand } };
    assert.equal(readJson.data.provenance, "POKERSTARS_RECONSTRUCTED");
    const hand = readJson.data.hand;
    validateCanonicalHand(hand);

    // Após distribuição inicial (antes do all-in showdown): perspectiva Hero revela só Hero; oponentes seguem ocultos
    const afterDealCursor = hand.events.findIndex((e) => e.kind === "CompletionBettingOrRaisingTo");
    assert.ok(afterDealCursor > 0);
    const publicPreFlop = buildReplayFrame(hand, afterDealCursor, { kind: "public" });
    assert.deepEqual(publicPreFlop.visibleCards[0], [null, null]);
    assert.deepEqual(publicPreFlop.visibleCards[1], [null, null]);
    const heroIdx = hand.players.findIndex((_, i) => replayPlayerName(hand, i) === "Hero");
    assert.equal(heroIdx, 2);
    const heroPreFlop = buildReplayFrame(hand, afterDealCursor, { kind: "player", playerIndex: heroIdx });
    assert.deepEqual(heroPreFlop.visibleCards[heroIdx], ["Qs", "Qh"]);
    assert.deepEqual(heroPreFlop.visibleCards[0], [null, null]);
    assert.deepEqual(heroPreFlop.visibleCards[1], [null, null]);

    // Confere devolução (Uncalled bet) na mão PT sem duplicar stack
    const ptItem = mttList.data.items.find((i) => i.handId === "2626400001")!;
    const ptReadRes = await GET(localRequest("http://127.0.0.1:3000/api/hand-library?action=read&recordId=" + encodeURIComponent(ptItem.recordId)));
    const ptReadJson = (await ptReadRes.json()) as { ok: boolean; data: { hand: CanonicalHand } };
    validateCanonicalHand(ptReadJson.data.hand);
    assert.deepEqual(ptReadJson.data.hand.results.returnedAtoms, ["0", "0", "620"]);
    assert.deepEqual(ptReadJson.data.hand.results.awardsAtoms, ["0", "0", "1190"]);
    const finalRecorded = buildReplayFrame(hand, hand.events.length, { kind: "recorded" });
    assert.deepEqual(finalRecorded.visibleCards[0], ["Ac", "8c"]);
    assert.deepEqual(finalRecorded.visibleCards[1], ["Ad", "Kd"]);
    assert.deepEqual(finalRecorded.visibleCards[2], ["Qs", "Qh"]);

    // Exportação original volta em .txt PokerStars íntegro e backup SQLite funciona
    const expRes = await GET(localRequest("http://127.0.0.1:3000/api/hand-library?action=export&part=source&recordId=" + encodeURIComponent(sidepotItem.recordId)));
    const expJson = (await expRes.json()) as { ok: boolean; data: { format: string; base64: string } };
    assert.equal(expJson.data.format, "txt");
    assert.ok(Buffer.from(expJson.data.base64, "base64").toString("utf8").includes("#2626400002"));

    const bkpRes = await GET(localRequest("http://127.0.0.1:3000/api/hand-library?action=backup"));
    const bkpJson = (await bkpRes.json()) as { ok: boolean; data: { base64: string } };
    assert.ok(Buffer.from(bkpJson.data.base64, "base64").toString("ascii", 0, 15).startsWith("SQLite format 3"));

    // Contrato rejeita manipulação de origem PokerStars em validateCanonicalHand
    const tampered: CanonicalHand = structuredClone(hand);
    tampered.events[0] = { ...tampered.events[0]!, origin: "PHH" };
    assert.throws(() => validateCanonicalHand(tampered), /origem de evento inválida/);
  } finally {
    if (prevEnabled === undefined) delete process.env.POKER_LIBRARY_ENABLED;
    else process.env.POKER_LIBRARY_ENABLED = prevEnabled;
    if (prevDb === undefined) delete process.env.POKER_LIBRARY_DATABASE;
    else process.env.POKER_LIBRARY_DATABASE = prevDb;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
