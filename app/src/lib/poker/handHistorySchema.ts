/** Contrato JSON do importador offline Python. Não é uma estratégia/CanonicalSpot. */
export type Observed<T> =
  | { status: "MISSING" }
  | { status: "REPORTED"; value: T }
  | { status: "INFERRED"; value: T; reason: string };

/** Inteiro não negativo em base 10. Unidade = 10^-decimalPlaces; nunca BB/EV. */
export type AtomicAmount = string;
export type HandStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER";
export type HandValidationStatus = "VALIDATED_COMPLETE" | "VALIDATED_PARTIAL";
export type MetadataValue = string | number | boolean | null | MetadataValue[] | { [key: string]: MetadataValue };

export interface HandSnapshot {
  street: HandStreet;
  board: string[];
  stacksAtoms: AtomicAmount[];
  betsAtoms: AtomicAmount[];
  potAtoms: AtomicAmount;
  actorIndex: number | null;
  folded: boolean[];
  mucked: boolean[];
  allIn: boolean[];
}

export interface HandEvent {
  sequence: number;
  sourceActionIndex: number | null;
  origin: "PHH" | "RULE_DERIVED";
  kind: string; // Nome da operação PokerKit ou UncollectedBetReturn documentado.
  playerIndex: number | null;
  amountAtoms: AtomicAmount | null; // cbr é alvo total da street, não incremento.
  cards: (string | null)[];
  paidAtoms: AtomicAmount[];
  returnedAtoms: AtomicAmount[];
  awardedAtoms: AtomicAmount[];
  before: HandSnapshot;
  after: HandSnapshot;
}

export interface HandPot {
  index: number;
  amountAtoms: AtomicAmount;
  eligiblePlayerIndices: number[]; // Antes de descartar mãos perdedoras no showdown.
  awardsAtoms: AtomicAmount[];
  origin: "RULE_DERIVED";
}

export interface CanonicalHand {
  schemaVersion: "1.0.0";
  profile: "PHH_NT_SUBSET_1";
  recordId: string;
  source: {
    format: "PHH";
    targetStandardVersion: "0.0.2"; // Alvo do parser; a fonte PHH não declara versão.
    sha256: string;
    byteLength: number;
    fileName: Observed<string>;
    handId: Observed<string | number>;
    importedAtUtc: string;
  };
  variant: "NLHE";
  gameFormat: Observed<"CASH" | "MTT" | "SNG">;
  amountPolicy: { encoding: "UNSIGNED_INTEGER_STRING"; decimalPlaces: number; currency: Observed<string> };
  table: {
    playerCount: number;
    seatCount: Observed<number>;
    rawBlindsAtoms: AtomicAmount[]; // Ordem original PHH; HU inverte no motor.
    rawAntesAtoms: AtomicAmount[];
    minBetAtoms: AtomicAmount;
    anteTrimming: Observed<boolean>;
  };
  players: {
    index: number;
    sourceLabel: string;
    name: Observed<string>;
    seat: Observed<number>;
    position: Observed<string>;
    initialStackAtoms: AtomicAmount;
    // Agregado FINAL da auditoria; sourceActionIndex é a última atualização.
    // Replay deve usar HoleDealing/Showing dos eventos até o frame, nunca este valor futuro.
    holeCards: Observed<(string | null)[]> & { sourceActionIndex?: number | null };
  }[];
  sourceActions: string[];
  events: HandEvent[];
  ending: HandSnapshot;
  pots: HandPot[]; // Disponíveis na liquidação, vazios em prefixos sem liquidação.
  results: {
    complete: boolean;
    computedFinalStacksAtoms: AtomicAmount[] | null;
    reportedEndingStacksAtoms: Observed<AtomicAmount[]>;
    grossContributionsAtoms: AtomicAmount[];
    returnedAtoms: AtomicAmount[];
    netContributionsAtoms: AtomicAmount[];
    awardsAtoms: AtomicAmount[];
  };
  integrity: {
    status: HandValidationStatus;
    validator: "PokerKit";
    validatorVersion: "0.7.7";
    engineMode: "CASH_GAME"; // Política de execução; não prova gameFormat.
    gtoAnalysis: "NOT_EVALUATED";
    evLoss: null;
    assumptions: string[];
    warnings: string[];
  };
  metadata: { [key: string]: MetadataValue };
}

export interface HandImportIssue {
  code: string;
  message: string;
  field: string | null;
  actionIndex: number | null;
}

export type HandImportResult =
  | { ok: true; status: HandValidationStatus; issues: []; hand: CanonicalHand }
  | { ok: false; status: "INVALID" | "UNSUPPORTED"; issues: HandImportIssue[]; hand: null };
