import {normalizeCardCode, validateDeckUnique} from "./cards.ts";
const ranks="23456789TJQKA", suits="shdc";
export function cardId(code:string):number {const c=normalizeCardCode(code);return ranks.indexOf(c[0])*4+suits.indexOf(c[1]);}
export function idCard(id:number):string {return ranks[Math.floor(id/4)]+suits[id%4];}
export const HAND_CATEGORIES=["Carta alta","Um par","Dois pares","Trinca","Sequência","Flush","Full house","Quadra","Straight flush"];
function encode(category:number,values:number[]):number {let score=category;for(let i=0;i<5;i++)score=score*15+(values[i]??0);return score;}
function straightHigh(mask:number):number {
  for(let high=14;high>=6;high--)if((mask & (31<<(high-4)))===(31<<(high-4)))return high;
  return (mask & ((1<<14)|60))===((1<<14)|60)?5:0;
}
/** Avaliação direta de 5–7 cartas. Valores maiores vencem; zero não representa carta. */
export function evaluateIds(cards: readonly number[]):number {
  const counts=new Uint8Array(15), suitCounts=new Uint8Array(4), masks=new Uint16Array(4);let mask=0;
  for(const card of cards){const r=Math.floor(card/4)+2,s=card%4;counts[r]++;suitCounts[s]++;masks[s]|=1<<r;mask|=1<<r;}
  const descending:number[]=[],pairs:number[]=[],trips:number[]=[];let four=0;
  for(let r=14;r>=2;r--){if(counts[r])descending.push(r);if(counts[r]===4)four=r;else if(counts[r]===3)trips.push(r);else if(counts[r]===2)pairs.push(r);}
  const flushSuit=suitCounts.findIndex(n=>n>=5);
  if(flushSuit>=0){const sf=straightHigh(masks[flushSuit]);if(sf)return encode(8,[sf]);}
  if(four)return encode(7,[four,descending.find(r=>r!==four)!]);
  if(trips.length&&(pairs.length||trips.length>1))return encode(6,[trips[0],Math.max(pairs[0]??0,trips[1]??0)]);
  if(flushSuit>=0){const values:number[]=[];for(let r=14;r>=2;r--)if(masks[flushSuit]&(1<<r))values.push(r);return encode(5,values.slice(0,5));}
  const straight=straightHigh(mask);if(straight)return encode(4,[straight]);
  if(trips.length)return encode(3,[trips[0],...descending.filter(r=>r!==trips[0]).slice(0,2)]);
  if(pairs.length>=2)return encode(2,[pairs[0],pairs[1],descending.find(r=>r!==pairs[0]&&r!==pairs[1])!]);
  if(pairs.length)return encode(1,[pairs[0],...descending.filter(r=>r!==pairs[0]).slice(0,3)]);
  return encode(0,descending.slice(0,5));
}
export function evaluateHand(cards:readonly string[]):{score:number;category:string} {
  if(cards.length<5||cards.length>7)throw Error("Avalie de 5 a 7 cartas.");
  const check=validateDeckUnique(cards);if(!check.valid)throw Error(check.error);
  const score=evaluateIds(check.normalized.map(cardId));return {score,category:HAND_CATEGORIES[Math.floor(score/15**5)]};
}

