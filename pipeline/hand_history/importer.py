"""PHH 0.0.2 / subconjunto NT. Orquestra o PokerKit; não reimplementa regras.

Nunca usa HandHistory.state_actions: seu reparo automático pode inserir folds/checks.
Valores entram como Decimal e todas as operações do PokerKit usam inteiros atômicos.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from importlib.metadata import version
import re
import tomllib
from typing import Any, Literal, TypedDict
import warnings

from pokerkit import Mode, NoLimitTexasHoldem, parse_action

SCHEMA_VERSION = "1.0.0"
PROFILE = "PHH_NT_SUBSET_1"
POKERKIT_VERSION = "0.7.7"
MAX_ATOMS = 9_007_199_254_740_991
MAX_BYTES = 1_048_576
REQUIRED = {"variant", "antes", "blinds_or_straddles", "min_bet", "starting_stacks", "actions"}
TEXT_FIELDS = {"author", "event", "url", "venue", "address", "city", "region", "postal_code", "country", "time_zone", "time_zone_abbreviation", "currency", "currency_symbol"}
INT_FIELDS = {"day", "month", "year", "level", "seat_count"}
OPTIONAL = TEXT_FIELDS | INT_FIELDS | {"time", "hand", "seats", "table", "players", "finishing_stacks", "ante_trimming_status"}
CARD = re.compile(r"(?:[2-9TJQKA][cdhs]|\?\?)\Z")
NUMBER = re.compile(r"(?:0|[1-9]\d*)(?:\.\d{1,6})?\Z")
STREETS = ("PREFLOP", "FLOP", "TURN", "RIVER")


class Issue(TypedDict):
    code: str
    message: str
    field: str | None
    actionIndex: int | None


class ImportResult(TypedDict):
    ok: bool
    status: Literal["VALIDATED_COMPLETE", "VALIDATED_PARTIAL", "INVALID", "UNSUPPORTED"]
    issues: list[Issue]
    hand: dict[str, Any] | None


class ImportFailure(Exception):
    def __init__(self, code: str, message: str, field: str | None = None, action: int | None = None, unsupported: bool = False):
        super().__init__(message)
        self.issue: Issue = {"code": code, "message": message, "field": field, "actionIndex": action}
        self.unsupported = unsupported


def field(value: Any = None, *, inferred: str | None = None, present: bool = True) -> dict[str, Any]:
    if not present:
        return {"status": "MISSING"}
    if inferred is not None:
        return {"status": "INFERRED", "value": value, "reason": inferred}
    return {"status": "REPORTED", "value": value}


def exact_number(value: Any, name: str) -> Decimal:
    if type(value) not in (int, Decimal):
        raise ImportFailure("NUMBER_TYPE", "Esperado número TOML finito, sem coerção de strings ou booleanos.", name)
    number = Decimal(value)
    if not number.is_finite() or number < 0 or number > MAX_ATOMS:
        raise ImportFailure("NUMBER_RANGE", "Valor negativo, não finito ou acima do limite seguro.", name)
    if number.as_tuple().exponent < -6:
        raise ImportFailure("PRECISION_UNSUPPORTED", "São suportadas até seis casas decimais explícitas.", name, unsupported=True)
    return number


def integer_atoms(value: Any, scale: int) -> int:
    """Desloca os dígitos exatos, sem depender do contexto Decimal do chamador.

    Chamado após validar finitude, sinal e precisão e determinar a escala comum.
    Multiplicação Decimal pode arredondar mesmo quando não há float na entrada.
    """
    parts = Decimal(value).as_tuple()
    coefficient = int("".join(map(str, parts.digits)))
    if not coefficient:
        return 0
    shift = int(parts.exponent) + scale
    if parts.sign or shift < 0:
        raise ImportFailure("ATOM_CONVERSION", "Valor não representável na escala exata.")
    return coefficient * 10 ** shift


def metadata_json(value: Any) -> Any:
    if isinstance(value, Decimal):
        return {"tomlType": "decimal", "value": str(value)}
    if isinstance(value, (date, time)):
        return {"tomlType": type(value).__name__, "value": value.isoformat()}
    if isinstance(value, list):
        return [metadata_json(v) for v in value]
    return value


def parse_document(raw: bytes) -> tuple[dict[str, Any], int, list[tuple[list[str], int]]]:
    if len(raw) > MAX_BYTES:
        raise ImportFailure("INPUT_TOO_LARGE", "Limite de 1 MiB por mão.", unsupported=True)
    try:
        doc = tomllib.loads(raw.decode("utf-8"), parse_float=Decimal)
    except RecursionError as exc:
        raise ImportFailure("PHH_NESTING_LIMIT", "Aninhamento TOML excede o limite seguro do parser.", unsupported=True) from exc
    except (UnicodeError, tomllib.TOMLDecodeError, ValueError) as exc:
        raise ImportFailure("PHH_SYNTAX", "Entrada UTF-8/TOML inválida.") from exc
    if doc.get("variant") != "NT":
        raise ImportFailure("VARIANT_UNSUPPORTED", "Este perfil aceita somente PHH variant='NT' (NLHE).", "variant", unsupported=True)
    if REQUIRED - doc.keys():
        raise ImportFailure("MISSING_FIELD", "Campos obrigatórios ausentes: " + ", ".join(sorted(REQUIRED - doc.keys())))
    if doc.keys() - REQUIRED - OPTIONAL:
        raise ImportFailure("FIELD_UNSUPPORTED", "Campos fora do perfil: " + ", ".join(sorted(doc.keys() - REQUIRED - OPTIONAL)), unsupported=True)
    stacks = doc["starting_stacks"]
    if not isinstance(stacks, list) or not 2 <= len(stacks) <= 9:
        raise ImportFailure("PLAYER_COUNT", "Esperados 2 a 9 stacks iniciais conhecidos.", "starting_stacks")
    n = len(stacks)
    numbers: list[Decimal] = []
    for key in ("starting_stacks", "antes", "blinds_or_straddles", "finishing_stacks"):
        if key not in doc:
            continue
        if not isinstance(doc[key], list) or len(doc[key]) != n:
            raise ImportFailure("ARRAY_LENGTH", "Array deve ter um valor por jogador.", key)
        converted = [exact_number(v, key) for v in doc[key]]
        if key == "starting_stacks" and any(v <= 0 for v in converted):
            raise ImportFailure("STACK_RANGE", "Stacks iniciais devem ser positivos e conhecidos.", key)
        numbers.extend(converted)
    minimum = exact_number(doc["min_bet"], "min_bet")
    numbers.append(minimum)
    blinds = doc["blinds_or_straddles"]
    if not 0 < blinds[0] <= blinds[1] or any(v != 0 for v in blinds[2:]) or minimum != blinds[1]:
        raise ImportFailure("BLINDS_UNSUPPORTED", "Suporte restrito a SB>0, BB>=SB, min_bet=BB, sem straddles ou dead blinds.", "blinds_or_straddles", unsupported=True)
    if type(doc.get("ante_trimming_status", False)) is not bool:
        raise ImportFailure("FIELD_TYPE", "ante_trimming_status deve ser booleano.", "ante_trimming_status")
    actions = doc["actions"]
    if not isinstance(actions, list) or len(actions) > 500 or not all(isinstance(a, str) and len(a) <= 2000 for a in actions):
        raise ImportFailure("ACTIONS_TYPE", "Esperado array de até 500 ações textuais de até 2.000 caracteres.", "actions")
    parsed: list[tuple[list[str], int]] = []
    dealt = 0
    for i, action in enumerate(actions):
        words = action.split("#", 1)[0].split()
        parsed.append((words, i))
        if not words:
            continue
        if words[:2] == ["d", "dh"] and len(words) == 4:
            if dealt >= n or words[2] != f"p{dealt + 1}":
                raise ImportFailure("DEAL_ORDER", "O perfil exige um dh de duas cartas para p1..pN, nessa ordem.", "actions", i)
            dealt += 1
        elif dealt != n:
            raise ImportFailure("DEAL_MISSING", "Todos os jogadores devem receber duas cartas explícitas ou '????' antes da ação.", "actions", i)
        elif len(words) == 3 and re.fullmatch(r"p[1-9]", words[0]) and words[1] == "cbr":
            if not NUMBER.fullmatch(words[2]):
                raise ImportFailure("ACTION_AMOUNT", "cbr exige valor decimal positivo, sem notação científica, até seis casas.", "actions", i)
            numbers.append(exact_number(Decimal(words[2]), "actions"))
        elif not ((len(words) == 2 and words[1] in ("cc", "f") and re.fullmatch(r"p[1-9]", words[0])) or
                  (len(words) in (2, 3) and words[1] == "sm" and re.fullmatch(r"p[1-9]", words[0])) or
                  (len(words) == 3 and words[:2] == ["d", "db"])):
            raise ImportFailure("ACTION_UNSUPPORTED", "Ação fora do perfil dh/db/cc/cbr/f/sm/comentário.", "actions", i, unsupported=True)
    if dealt != n:
        raise ImportFailure("DEAL_MISSING", "Esperada distribuição inicial completa, inclusive cartas desconhecidas.", "actions")
    for key in TEXT_FIELDS & doc.keys():
        if not isinstance(doc[key], str):
            raise ImportFailure("FIELD_TYPE", "Metadado deve ser string.", key)
    for key in INT_FIELDS & doc.keys():
        if type(doc[key]) is not int or not 0 < doc[key] <= MAX_ATOMS:
            raise ImportFailure("FIELD_TYPE", "Metadado deve ser inteiro positivo.", key)
    if any(key in doc and not 1 <= doc[key] <= limit for key, limit in (("day", 31), ("month", 12), ("year", 9999))):
        raise ImportFailure("DATE_INVALID", "Dia, mês ou ano fora do intervalo suportado.")
    if {"day", "month", "year"} <= doc.keys():
        try:
            date(doc["year"], doc["month"], doc["day"])
        except ValueError as exc:
            raise ImportFailure("DATE_INVALID", "Data civil inconsistente.") from exc
    if "seat_count" in doc and not n <= doc["seat_count"] <= 9:
        raise ImportFailure("SEAT_COUNT", "seat_count deve estar entre o número de jogadores e 9.", "seat_count")
    if "seats" in doc and (not isinstance(doc["seats"], list) or len(doc["seats"]) != n or
        not all(type(s) is int and 1 <= s <= doc.get("seat_count", 9) for s in doc["seats"]) or len(set(doc["seats"])) != n):
        raise ImportFailure("SEATS_INVALID", "Assentos devem ser únicos, positivos e compatíveis com a mesa.", "seats")
    if "players" in doc and (not isinstance(doc["players"], list) or len(doc["players"]) != n or not all(isinstance(p, str) for p in doc["players"])):
        raise ImportFailure("PLAYERS_INVALID", "players deve ter um nome (ou string vazia) por jogador.", "players")
    for key in ("hand", "table"):
        if key in doc and type(doc[key]) not in (int, str):
            raise ImportFailure("FIELD_TYPE", "Identificador deve ser string ou inteiro.", key)
        if key in doc and type(doc[key]) is int and abs(doc[key]) > MAX_ATOMS:
            raise ImportFailure("IDENTIFIER_RANGE", "Identificador inteiro excede o contrato JSON seguro; use identificador textual.", key, unsupported=True)
    if "time" in doc and type(doc["time"]) is not time:
        raise ImportFailure("FIELD_TYPE", "time deve ser horário local TOML.", "time")
    scale = max(0, max(-v.as_tuple().exponent for v in numbers))
    if any(integer_atoms(v, scale) > MAX_ATOMS for v in numbers) or sum(integer_atoms(v, scale) for v in stacks) > MAX_ATOMS:
        raise ImportFailure("AMOUNT_OVERFLOW", "Valores atômicos ou soma dos stacks excedem 2^53−1.")
    return doc, scale, parsed


class Session:
    def __init__(self, doc: dict[str, Any], scale: int):
        self.doc, self.scale, self.factor = doc, scale, 10 ** scale
        self.n = len(doc["starting_stacks"])
        self.events: list[dict[str, Any]] = []
        self.holes: list[Any] = [field(present=False) for _ in range(self.n)]
        self.folded = [False] * self.n
        self.mucked = [False] * self.n
        self.gross = [0] * self.n
        self.returns = [0] * self.n
        self.awards = [0] * self.n
        self.pots: list[dict[str, Any]] = []
        self.short_raise_street: int | None = None
        self.settlement_started = False
        self.pots_captured = False
        self.retained_matched = [0] * self.n
        self.event_origin = "PHH"
        self.allow_fold_on_check = False
        self.extra_warnings: list[str] = []
        self.initial = [self.atoms(v) for v in doc["starting_stacks"]]
        self.state = NoLimitTexasHoldem.create_state(
            (), doc.get("ante_trimming_status", False), [self.atoms(v) for v in doc["antes"]],
            [self.atoms(v) for v in doc["blinds_or_straddles"]], self.atoms(doc["min_bet"]),
            self.initial, self.n, mode=Mode.CASH_GAME,
        )

    def atoms(self, value: Any) -> int:
        return integer_atoms(value, self.scale)

    def snapshot(self) -> dict[str, Any]:
        s = self.state
        board = [repr(cards[0]) for cards in s.board_cards]
        street = STREETS[s.street_index] if s.street_index is not None else STREETS[{0: 0, 3: 1, 4: 2, 5: 3}[len(board)]]
        total = sum(s.stacks) + s.total_pot_amount
        if total != sum(self.initial) or any(v < 0 for v in s.stacks):
            raise ImportFailure("CONSERVATION", "Falha na conservação exata de fichas no estado.")
        return {"street": street, "board": board, "stacksAtoms": list(map(str, s.stacks)), "betsAtoms": list(map(str, s.bets)),
                "potAtoms": str(s.total_pot_amount), "actorIndex": s.actor_index, "folded": self.folded.copy(), "mucked": self.mucked.copy(),
                "allIn": [s.stacks[i] == 0 and not self.folded[i] for i in range(self.n)]}

    def step(self, operation: Any, source_index: int | None, *, reported: bool = False) -> None:
        s = self.state
        before = self.snapshot()
        old_bets, old_stacks = s.bets.copy(), s.stacks.copy()
        op = operation()
        kind = type(op).__name__
        actor = getattr(op, "player_index", None)
        paid = [0] * self.n
        returned = [0] * self.n
        awarded = [0] * self.n
        if kind in ("AntePosting", "BlindOrStraddlePosting", "CheckingOrCalling"):
            paid[actor] = op.amount
        elif kind == "CompletionBettingOrRaisingTo":
            paid[actor] = op.amount - old_bets[actor]
        elif kind == "BetCollection":
            returned = [s.stacks[i] - old_stacks[i] for i in range(self.n)]
            # PokerKit mantém a aposta inteira do vencedor por folds fora de
            # state.pots. Só o excesso não pago é devolução no modelo canônico.
            for i, remaining in enumerate(s.bets):
                if remaining:
                    self.retained_matched[i] = min(remaining, max(old_bets[:i] + old_bets[i+1:]))
        elif kind == "Folding":
            self.folded[actor] = True
        elif kind in ("HoleDealing", "HoleCardsShowingOrMucking"):
            cards = getattr(op, "cards", getattr(op, "hole_cards", ()))
            if cards:
                self.holes[actor] = {**field([None if repr(c) == "??" else repr(c) for c in cards]), "sourceActionIndex": source_index}
            elif kind == "HoleCardsShowingOrMucking":
                self.mucked[actor] = True
        elif kind == "ChipsPushing":
            awarded = list(op.amounts)
            if op.pot_index == 0 and any(self.retained_matched):
                awarded = [amount + self.retained_matched[i] for i, amount in enumerate(awarded)]
                self.retained_matched = [0] * self.n
            self._allocate_pot_awards(op.pot_index, awarded)
        if any(v < 0 for v in paid + returned):
            raise ImportFailure("LEDGER", "Movimentação negativa inesperada no ledger.")
        for i in range(self.n):
            self.gross[i] += paid[i]
            self.returns[i] += returned[i]
            self.awards[i] += awarded[i]
        known = [c for h in self.holes if h["status"] != "MISSING" for c in h["value"] if c is not None]
        known.extend(repr(cards[0]) for cards in s.board_cards)
        if len(known) != len(set(known)):
            raise ImportFailure("DUPLICATE_CARD", "Carta conhecida repetida entre mãos e board.", "actions", source_index)
        cards = (op.card,) if kind == "CardBurning" else getattr(op, "cards", getattr(op, "hole_cards", ()))
        event = {"sequence": len(self.events), "sourceActionIndex": source_index, "origin": self.event_origin if reported else "RULE_DERIVED",
                 "kind": kind, "playerIndex": actor, "amountAtoms": str(op.amount) if hasattr(op, "amount") else None,
                 "cards": [None if repr(c) == "??" else repr(c) for c in cards],
                 "paidAtoms": list(map(str, paid)), "returnedAtoms": list(map(str, returned)), "awardedAtoms": list(map(str, awarded)),
                 "before": before, "after": self.snapshot()}
        self.events.append(event)

    def _allocate_pot_awards(self, pot_index: int, awarded: list[int]) -> None:
        """Distribui ChipsPushing nos potes antes de HandKilling, tratando sweeps mesclados pelo PokerKit."""
        remaining = list(awarded)
        for pot in self.pots[pot_index:]:
            if not any(remaining):
                return
            current_sum = sum(int(x) for x in pot["awardsAtoms"])
            capacity = int(pot["amountAtoms"]) - current_sum
            if capacity <= 0:
                continue
            eligible = pot["eligiblePlayerIndices"]
            winners_here = [i for i in eligible if remaining[i] > 0]
            if not winners_here:
                continue
            # Caso direto (sem sweep multi-pote): todo restante cabe exatamente neste pote e elegíveis batem.
            if sum(remaining) <= capacity and all(i in eligible for i, amt in enumerate(remaining) if amt > 0):
                for i, amt in enumerate(remaining):
                    if amt > 0:
                        pot["awardsAtoms"][i] = str(int(pot["awardsAtoms"][i]) + amt)
                        remaining[i] = 0
                return
            if len(winners_here) == 1:
                wi = winners_here[0]
                give = min(capacity, remaining[wi])
                pot["awardsAtoms"][wi] = str(int(pot["awardsAtoms"][wi]) + give)
                remaining[wi] -= give
            else:
                share, odd = divmod(capacity, len(winners_here))
                for idx_w, wi in enumerate(winners_here):
                    give = min(remaining[wi], share + (1 if idx_w < odd else 0))
                    pot["awardsAtoms"][wi] = str(int(pot["awardsAtoms"][wi]) + give)
                    remaining[wi] -= give
        if any(remaining):
            raise ImportFailure("SETTLEMENT_CONSERVATION", "Prêmio do ChipsPushing excede a capacidade/elegibilidade dos potes.")

    def drain(self, source_index: int | None) -> None:
        # Somente tarefas obrigatórias do motor. Não insere check, fold ou cartas de mão.
        methods = ("post_ante", "collect_bets", "post_blind_or_straddle", "burn_card", "select_runout_count", "kill_hand", "push_chips", "pull_chips")
        for _ in range(100):
            for name in methods:
                if not getattr(self.state, "can_" + name)():
                    continue
                if name in ("kill_hand", "push_chips") and not self.pots_captured:
                    self.pots = [{"index": i, "amountAtoms": str(p.amount), "eligiblePlayerIndices": list(p.player_indices),
                                  "awardsAtoms": ["0"] * self.n, "origin": "RULE_DERIVED"} for i, p in enumerate(self.state.pots)]
                    if self.pots:
                        self.pots[0]["amountAtoms"] = str(int(self.pots[0]["amountAtoms"]) + sum(self.retained_matched))
                    self.pots_captured = True
                if name == "push_chips" and not self.settlement_started:
                    # Aposta não coletada do único sobrevivente volta junto com o pull.
                    remaining = [bet - self.retained_matched[i] for i, bet in enumerate(self.state.bets)]
                    if any(remaining):
                        for i, amount in enumerate(remaining):
                            self.returns[i] += amount
                        self.events.append({"sequence": len(self.events), "sourceActionIndex": source_index, "origin": "RULE_DERIVED",
                            "kind": "UncollectedBetReturn", "playerIndex": None, "amountAtoms": None, "cards": [],
                            "paidAtoms": ["0"] * self.n, "returnedAtoms": list(map(str, remaining)), "awardedAtoms": ["0"] * self.n,
                            "before": self.snapshot(), "after": self.snapshot()})
                    self.settlement_started = True
                self.step(lambda: self.state.burn_card("??") if name == "burn_card" else getattr(self.state, name)(), source_index)
                break
            else:
                return
        raise ImportFailure("OPERATION_LIMIT", "Número inesperado de operações obrigatórias.")

    def action(self, words: list[str], index: int) -> None:
        s = self.state
        if not words:
            self.step(lambda: s.no_operate(), index, reported=True)
            return
        if not s.status:
            if len(words) in (2, 3) and words[1] == "sm":
                raise ImportFailure("POST_TERMINAL_SHOW_UNSUPPORTED", "Revelação após a liquidação é prevista no PHH, mas está fora deste perfil.", "actions", index, unsupported=True)
            raise ImportFailure("ACTION_AFTER_END", "Ação após o encerramento da mão.", "actions", index)
        if words[:2] in (["d", "dh"], ["d", "db"]) or (len(words) == 3 and words[1] == "sm" and words[2] != "-"):
            cards = words[-1]
            if len(cards) % 2 or not all(CARD.fullmatch(cards[i:i+2]) for i in range(0, len(cards), 2)):
                raise ImportFailure("CARD_SYNTAX", "Carta deve ser rank+naipe ou '??'.", "actions", index)
            if words[:2] == ["d", "dh"] or words[1] == "sm":
                if len(cards) != 4:
                    raise ImportFailure("HOLE_CARD_COUNT", "NLHE exige exatamente duas cartas por jogador.", "actions", index)
            if words[:2] == ["d", "db"] and "?" in cards:
                raise ImportFailure("UNKNOWN_BOARD", "Board desconhecido está fora deste perfil.", "actions", index, unsupported=True)
            if words[:2] == ["d", "db"] and len(cards) != (6 if not s.board_cards else 2):
                raise ImportFailure("BOARD_CARD_COUNT", "O perfil exige flop de três cartas e turn/river de uma carta.", "actions", index)
            if words[1] == "sm":
                actor = int(words[0][1:]) - 1
                if not 0 <= actor < self.n:
                    raise ImportFailure("PLAYER_INDEX", "Jogador inexistente.", "actions", index)
                old_known = {c for c in self.holes[actor].get("value", []) if c is not None}
                new_known = {cards[i:i+2] for i in range(0, 4, 2)}
                if "??" in new_known or not old_known <= new_known:
                    raise ImportFailure("SHOWDOWN_CARDS", "Show exige duas cartas conhecidas compatíveis com a distribuição.", "actions", index)
        if len(words) == 3 and words[1] == "cbr":
            if self.short_raise_street == s.street_index:
                raise ImportFailure("SHORT_ALLIN_REOPEN_UNSUPPORTED", "Nova agressão na mesma street após aumento incompleto não é certificada pelo perfil PokerKit 0.7.7.", "actions", index, unsupported=True)
            target = self.atoms(words[2])
            threshold = max(self.atoms(self.doc["min_bet"]), s.completion_betting_or_raising_amount)
            if target - max(s.bets) < threshold:
                self.short_raise_street = s.street_index
        try:
            if self.allow_fold_on_check and len(words) == 2 and words[1] == "f":
                with warnings.catch_warnings(record=True) as caught:
                    warnings.simplefilter("always")
                    self.step(lambda: parse_action_return(s, " ".join(words), self.atoms), index, reported=True)
                for w in caught:
                    msg = str(w.message)
                    if isinstance(w.message, UserWarning) and msg.startswith("There is no reason for this player to fold"):
                        note = "Jogador registrou fold mesmo podendo pedir check sem custo adicional."
                        if note not in self.extra_warnings:
                            self.extra_warnings.append(note)
                    else:
                        raise w.message
            else:
                self.step(lambda: parse_action_return(s, " ".join(words), self.atoms), index, reported=True)
            self.drain(index)
        except (ValueError, UserWarning, IndexError) as exc:
            raise ImportFailure("ILLEGAL_ACTION", "Ação rejeitada pelo motor: " + str(exc), "actions", index) from exc


def parse_action_return(state: Any, action: str, parse_value: Any) -> Any:
    count = len(state.operations)
    parse_action(state, action, parse_value=parse_value)
    if len(state.operations) != count + 1:
        raise ImportFailure("ENGINE_AUTOMATION", "Operações implícitas inesperadas; reparo de ações não permitido.")
    return state.operations[-1]


def finalize_session_result(
    session: Session,
    doc: dict[str, Any],
    scale: int,
    raw_len: int,
    raw_sha256: str,
    source_name: str | None = None,
    *,
    record_id_override: str | None = None,
    source_override: dict[str, Any] | None = None,
    game_format_field: dict[str, Any] | None = None,
    extra_metadata: dict[str, Any] | None = None,
    extra_warnings: list[str] | None = None,
    roles_override: list[str] | None = None,
) -> ImportResult:
    ending = session.snapshot()
    complete = not session.state.status
    if "finishing_stacks" in doc and [session.atoms(v) for v in doc["finishing_stacks"]] != session.state.stacks:
        raise ImportFailure("FINAL_STACKS_MISMATCH", "finishing_stacks diverge do estado reconstruído; não foi ajustado para fazê-lo fechar.", "finishing_stacks")
    net = [session.gross[i] - session.returns[i] for i in range(session.n)]
    if complete and (sum(net) != sum(session.awards) or any(session.initial[i] - net[i] + session.awards[i] != session.state.stacks[i] for i in range(session.n))):
        raise ImportFailure("SETTLEMENT_CONSERVATION", "Contribuições, devoluções, prêmios e stacks finais não fecham.")
    status = "VALIDATED_COMPLETE" if complete else "VALIDATED_PARTIAL"
    roles = roles_override if roles_override is not None else (["BB", "BTN/SB"] if session.n == 2 else ["SB", "BB"] + ["OTHER"] * (session.n - 3) + ["BTN"])
    pos_reason = "Ordem da mesa na fonte PokerStars." if roles_override is not None else "Ordem PHH; HU inverte blinds/antes, sem inventar assento físico."
    all_warnings = [] if complete else ["Histórico é prefixo legal, não uma mão terminada; nenhum resultado final foi inventado."]
    for w in [*session.extra_warnings, *(extra_warnings or [])]:
        if w not in all_warnings:
            all_warnings.append(w)
    source_obj = source_override if source_override is not None else {
        "format": "PHH", "targetStandardVersion": "0.0.2", "sha256": raw_sha256, "byteLength": raw_len,
        "fileName": field(source_name, present=source_name is not None), "handId": field(doc.get("hand"), present="hand" in doc),
        "importedAtUtc": datetime.now(timezone.utc).isoformat(),
    }
    metadata = {key: metadata_json(value) for key, value in doc.items() if key not in REQUIRED}
    if extra_metadata:
        metadata.update(extra_metadata)
    hand = {"schemaVersion": SCHEMA_VERSION, "profile": PROFILE, "recordId": record_id_override or ("phh-sha256:" + raw_sha256),
        "source": source_obj,
        "variant": "NLHE", "gameFormat": game_format_field if game_format_field is not None else field(present=False),
        "amountPolicy": {"encoding": "UNSIGNED_INTEGER_STRING", "decimalPlaces": scale, "currency": field(doc.get("currency"), present="currency" in doc)},
        "table": {"playerCount": session.n, "seatCount": field(doc.get("seat_count"), present="seat_count" in doc),
                  "rawBlindsAtoms": list(map(lambda v: str(session.atoms(v)), doc["blinds_or_straddles"])),
                  "rawAntesAtoms": list(map(lambda v: str(session.atoms(v)), doc["antes"])), "minBetAtoms": str(session.atoms(doc["min_bet"])),
                  "anteTrimming": field(doc.get("ante_trimming_status", False), inferred=None if "ante_trimming_status" in doc else "Padrão documentado do perfil: false.")},
        "players": [{"index": i, "sourceLabel": f"p{i+1}", "name": field(doc.get("players", [None]*session.n)[i], present="players" in doc),
                     "seat": field(doc.get("seats", [None]*session.n)[i], present="seats" in doc),
                     "position": field(roles[i], inferred=pos_reason),
                     "initialStackAtoms": str(session.initial[i]), "holeCards": session.holes[i]} for i in range(session.n)],
        "sourceActions": doc["actions"], "events": session.events, "ending": ending, "pots": session.pots,
        "results": {"complete": complete, "computedFinalStacksAtoms": list(map(str, session.state.stacks)) if complete else None,
                    "reportedEndingStacksAtoms": field([str(session.atoms(v)) for v in doc.get("finishing_stacks", [])], present="finishing_stacks" in doc),
                    "grossContributionsAtoms": list(map(str, session.gross)), "returnedAtoms": list(map(str, session.returns)),
                    "netContributionsAtoms": list(map(str, net)), "awardsAtoms": list(map(str, session.awards))},
        "integrity": {"status": status, "validator": "PokerKit", "validatorVersion": POKERKIT_VERSION,
                      "engineMode": "CASH_GAME", "gtoAnalysis": "NOT_EVALUATED", "evLoss": None,
                      "assumptions": ["Sem rake; uma única corrida de board; divisão inteira por ordem PHH no motor; sem reparo de ações.",
                                      "Modo do motor é política de execução, não evidência de modalidade da mão."],
                      "warnings": all_warnings},
        "metadata": metadata}
    return {"ok": True, "status": status, "issues": [], "hand": hand}


def reconstruct_from_phh_bytes(
    raw: bytes,
    source_name: str | None = None,
    *,
    allow_fold_on_check: bool = False,
    record_id_override: str | None = None,
    source_override: dict[str, Any] | None = None,
    game_format_field: dict[str, Any] | None = None,
    extra_metadata: dict[str, Any] | None = None,
    extra_warnings: list[str] | None = None,
    event_origin: str = "PHH",
    roles_override: list[str] | None = None,
) -> ImportResult:
    try:
        if version("pokerkit") != POKERKIT_VERSION:
            raise ImportFailure("DEPENDENCY_VERSION", "Este perfil exige PokerKit " + POKERKIT_VERSION, unsupported=True)
        doc, scale, actions = parse_document(raw)
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            session = Session(doc, scale)
            session.event_origin = event_origin
            session.allow_fold_on_check = allow_fold_on_check
            session.drain(None)
            for words, index in actions:
                session.action(words, index)
        return finalize_session_result(
            session, doc, scale, len(raw), sha256(raw).hexdigest(), source_name,
            record_id_override=record_id_override, source_override=source_override,
            game_format_field=game_format_field, extra_metadata=extra_metadata,
            extra_warnings=extra_warnings, roles_override=roles_override,
        )
    except ImportFailure as exc:
        return {"ok": False, "status": "UNSUPPORTED" if exc.unsupported else "INVALID", "issues": [exc.issue], "hand": None}
    except (ValueError, UserWarning, InvalidOperation, OverflowError, IndexError) as exc:
        return {"ok": False, "status": "INVALID", "issues": [{"code": "ENGINE_VALIDATION", "message": str(exc), "field": None, "actionIndex": None}], "hand": None}


def import_phh(raw: bytes, source_name: str | None = None) -> ImportResult:
    return reconstruct_from_phh_bytes(raw, source_name)
