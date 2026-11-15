import {cellToHand, expandHandClassToCombos, normalizeCardCode, validateDeckUnique} from "./cards.ts";

export interface WeightedCombo { cards: [string,string]; weight: number }
export interface LabRange { label: string; source: string; combos: WeightedCombo[] }
export const MIN_LAB_WEIGHT=1e-9;
export function comboKey(cards: readonly string[]): string { return [...cards].map(normalizeCardCode).sort().join(""); }

/** Gramática explícita: AA, AKs:0.5, AsKh:1. Sem + ou intervalos implícitos. */
export function parseLabRange(text: string, source = "Entrada manual do usuário"): LabRange {
  if(text.length>60000)throw Error("Texto de range acima do limite de 60.000 caracteres.");
  const entries=text.trim().split(/[\s,;]+/).filter(Boolean);
  if(entries.length>1500)throw Error("Range acima de 1.500 entradas.");
  const map=new Map<string,WeightedCombo>();
  for(const entry of entries){
    const parts=entry.split(":");
    if(parts.length>2)throw Error(`Entrada inválida: ${entry}`);
    const [hand,raw]=parts, weight=raw===undefined?1:Number(raw);
    if(raw===""||!Number.isFinite(weight)||weight<0||weight>1||(weight>0&&weight<MIN_LAB_WEIGHT))throw Error("Pesos: zero ou entre 0,000000001 e 1 (limite numérico).");
    const combos: {cards:[string,string]}[]=hand.length===4
      ? [{cards:[normalizeCardCode(hand.slice(0,2)),normalizeCardCode(hand.slice(2))]}]
      : expandHandClassToCombos(hand);
    for(const {cards} of combos){
      const check=validateDeckUnique(cards);if(!check.valid)throw Error(check.error);
      const key=comboKey(cards);
      if(map.has(key))throw Error(`Combo repetido no range: ${key}. Remova sobreposições.`);
      map.set(key,{cards:[...check.normalized].sort() as [string,string],weight});
    }
  }
  return {label:"Range de estudo",source,combos:[...map.values()].sort((a,b)=>comboKey(a.cards).localeCompare(comboKey(b.cards),"en"))};
}
export function serializeLabRange(range: LabRange): string {
  return range.combos.map(c=>`${comboKey(c.cards)}:${c.weight}`).join(", ");
}
export function legalRange(range: LabRange, blocked: readonly string[]): LabRange {
  const check=validateDeckUnique(blocked);if(!check.valid)throw Error(check.error);
  const dead=new Set(check.normalized);
  return {...range,combos:range.combos.filter(c=>c.weight>0&&!c.cards.some(x=>dead.has(x)))};
}
export function rangeCell(row: number,col: number): string { return cellToHand(row,col); }

