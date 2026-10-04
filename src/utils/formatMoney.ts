// Целые суммы без копеек, дробные — с двумя знаками: пополнение 36,61 не должно
// превращаться в 37. Для крупных итогов по чекам округление до целых остаётся.
export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
}
