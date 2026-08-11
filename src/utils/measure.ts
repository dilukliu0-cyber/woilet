// Количество товара: приведение единиц и форматирование.
//
// Модель возвращает единицы как попало — в базе одновременно «г» и «g»,
// «кг» и «kg», «л» и «L». Экраны складывали числа как есть, а подпись
// брали из первой попавшейся покупки: 665 г и 0.4 кг давали «665.4 кг».
// Плюс дробные объёмы округлялись до целых, и бутылка 0.5 л показывалась
// как «1 л».
//
// Поэтому всё сводится к базовой единице своего измерения (масса — граммы,
// объём — миллилитры), суммируется отдельно по измерениям и только на
// выводе переводится в удобную единицу.

export type Dimension = 'mass' | 'volume';

const UNITS: Record<string, { dim: Dimension; toBase: number }> = {
  г: { dim: 'mass', toBase: 1 },
  гр: { dim: 'mass', toBase: 1 },
  g: { dim: 'mass', toBase: 1 },
  gr: { dim: 'mass', toBase: 1 },
  кг: { dim: 'mass', toBase: 1000 },
  kg: { dim: 'mass', toBase: 1000 },
  мл: { dim: 'volume', toBase: 1 },
  ml: { dim: 'volume', toBase: 1 },
  л: { dim: 'volume', toBase: 1000 },
  l: { dim: 'volume', toBase: 1000 },
};

export type Measure = { dim: Dimension; base: number };

/** Одна позиция → количество в базовой единице. null для штук и неизвестных единиц. */
export function toBaseAmount(value: number | null, unit: string | null, quantity = 1): Measure | null {
  if (!value || !unit) return null;
  const spec = UNITS[unit.trim().toLowerCase()];
  if (!spec) return null;
  return { dim: spec.dim, base: value * spec.toBase * (quantity || 1) };
}

/**
 * Суммирует позиции по измерениям. Масса и объём складываются раздельно:
 * «300 г + 1.5 л» — это не 1800 чего-то, а два разных числа.
 */
export function sumMeasures(
  rows: { value: number | null; unit: string | null; quantity?: number }[],
): Map<Dimension, number> {
  const totals = new Map<Dimension, number>();
  for (const row of rows) {
    const measure = toBaseAmount(row.value, row.unit, row.quantity ?? 1);
    if (!measure) continue;
    totals.set(measure.dim, (totals.get(measure.dim) ?? 0) + measure.base);
  }
  return totals;
}

type UnitLabels = { g: string; kg: string; ml: string; l: string };

/**
 * Базовое количество → читаемая строка. Крупные величины переводятся в
 * кг/л, дробная часть показывается только когда она есть: «2 кг», но
 * «1.5 кг», и «0.5 л» вместо округлённого до нуля или единицы.
 */
export function formatMeasure(dim: Dimension, base: number, labels: UnitLabels): string {
  const big = dim === 'mass' ? labels.kg : labels.l;
  const small = dim === 'mass' ? labels.g : labels.ml;

  if (base >= 1000) {
    // Один знак после запятой: два давали артефакты округления двоичной
    // дробью (1065 г → «1.06 кг») и лишнюю точность, которая в списке
    // покупок никому не нужна.
    const value = Math.round(base / 100) / 10;
    const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return `${text} ${big}`;
  }

  const text = Number.isInteger(base) ? String(base) : base.toFixed(base < 10 ? 1 : 0);
  return `${text} ${small}`;
}

/** Готовая строка по набору позиций: «1.5 кг · 2 л» либо пусто. */
export function formatTotals(
  rows: { value: number | null; unit: string | null; quantity?: number }[],
  labels: UnitLabels,
): string {
  const totals = sumMeasures(rows);
  const parts: string[] = [];
  // Масса первой: у продуктов она встречается чаще объёма.
  for (const dim of ['mass', 'volume'] as Dimension[]) {
    const base = totals.get(dim);
    if (base && base > 0) parts.push(formatMeasure(dim, base, labels));
  }
  return parts.join(' · ');
}
