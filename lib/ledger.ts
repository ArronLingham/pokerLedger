import type { GameResult, Settlement, ChipDenomination } from "@/lib/types";

/**
 * Net result from games per member: sum(cash_out - buy_in).
 * Positive = won money (is owed), negative = lost money (owes).
 */
export function netsByMember(results: GameResult[]): Map<string, number> {
  const nets = new Map<string, number>();
  for (const r of results) {
    const net = Number(r.cash_out) - Number(r.buy_in);
    nets.set(r.member_id, (nets.get(r.member_id) ?? 0) + net);
  }
  return nets;
}

/**
 * Outstanding balance per member after applying recorded settlements.
 *
 * A settlement is a payment `from_member -> to_member`. Paying down a debt
 * moves the payer's balance up toward 0 and the receiver's balance down
 * toward 0:
 *   balance[m] = net[m] + sum(amount where from == m) - sum(amount where to == m)
 *
 * Positive balance = still owed money; negative = still owes money.
 */
export function outstandingBalances(
  results: GameResult[],
  settlements: Settlement[],
  memberIds: string[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const id of memberIds) balances.set(id, 0);

  const nets = netsByMember(results);
  for (const [id, net] of nets) balances.set(id, (balances.get(id) ?? 0) + net);

  for (const s of settlements) {
    const amt = Number(s.amount);
    balances.set(s.from_member, (balances.get(s.from_member) ?? 0) + amt);
    balances.set(s.to_member, (balances.get(s.to_member) ?? 0) - amt);
  }

  return balances;
}

export type SuggestedPayment = {
  from: string; // member id who pays
  to: string; // member id who receives
  amount: number;
};

/**
 * Greedy settle-up: produce a small set of payments that zeroes out all
 * outstanding balances. Debtors (negative) pay creditors (positive).
 */
export function suggestSettlements(
  balances: Map<string, number>,
): SuggestedPayment[] {
  const EPS = 0.005;
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const [id, balance] of balances) {
    if (balance < -EPS) debtors.push({ id, amount: -balance });
    else if (balance > EPS) creditors.push({ id, amount: balance });
  }

  // Largest amounts first keeps the transaction count low.
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const payments: SuggestedPayment[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    payments.push({
      from: debtors[i].id,
      to: creditors[j].id,
      amount: Math.round(pay * 100) / 100,
    });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= EPS) i++;
    if (creditors[j].amount <= EPS) j++;
  }

  return payments;
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatChips(amount: number, denominations: ChipDenomination[]): { denom: ChipDenomination; count: number }[] {
  const sorted = [...denominations].sort((a, b) => b.value - a.value);
  const result: { denom: ChipDenomination; count: number }[] = [];
  let remaining = amount;
  for (const denom of sorted) {
    if (remaining >= denom.value) {
      const count = Math.floor(remaining / denom.value);
      result.push({ denom, count });
      remaining = remaining % denom.value;
    }
  }
  return result;
}

export function formatChipsString(amount: number, denominations: ChipDenomination[]): string {
  if (amount === 0) return "0";
  const chips = formatChips(amount, denominations);
  if (chips.length === 0) return formatMoney(amount);
  return chips.map((c) => `${c.count}${c.denom.label || "x" + c.denom.value}`).join(" ");
}

