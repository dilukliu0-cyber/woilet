import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { themedStyles } from '../../theme/themedStyles';

// «Переписанный» чек: вместо фото — типографски набранная копия по
// распознанным данным (магазин, товары, итог), как настоящий бумажный
// чек, но всегда чёткая и читаемая независимо от качества фото.
type Item = {
  name: string;
  price: number;
  quantity: number;
};

type Props = {
  storeName: string;
  storeAddress?: string | null;
  purchaseDate?: string | null;
  purchaseTime?: string | null;
  items: Item[];
  total: number;
  currency: string;
  totalLabel: string;
};

const MONO = Platform.OS === 'ios' ? 'Courier' : 'monospace';
const PAPER_BG = '#FBF8EF';
const INK = '#2E2A22';
const INK_MUTED = '#8C8570';
const DASH = '#CFC7AE';

// Стабильный псевдослучайный узор для штрихкода — зависит от содержимого
// чека, а не от Math.random(), чтобы не мигал при перерендерах.
function seededBars(seed: string, count: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(1 + (h % 3));
  }
  return bars;
}

export function DigitalReceipt({
  storeName,
  storeAddress,
  purchaseDate,
  purchaseTime,
  items,
  total,
  currency,
  totalLabel,
}: Props) {
  const bars = useMemo(
    () => seededBars(`${storeName}${total}${items.length}`, 34),
    [storeName, total, items.length],
  );

  return (
    <View style={styles.paper}>
      <Text style={styles.store}>{storeName.toUpperCase()}</Text>
      {storeAddress ? <Text style={styles.meta}>{storeAddress}</Text> : null}
      {purchaseDate || purchaseTime ? (
        <Text style={styles.meta}>{[purchaseDate, purchaseTime].filter(Boolean).join('  ')}</Text>
      ) : null}

      <View style={styles.dashed} />

      {items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.quantity > 1 ? `${item.quantity}x ` : ''}
            {item.name}
          </Text>
          <Text style={styles.itemPrice}>{item.price.toFixed(2)}</Text>
        </View>
      ))}

      <View style={styles.dashed} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={styles.totalValue}>
          {total.toFixed(2)} {currency}
        </Text>
      </View>

      <View style={styles.barcode}>
        {bars.map((w, i) => (
          <View key={i} style={[styles.bar, { width: w }]} />
        ))}
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  paper: {
    backgroundColor: PAPER_BG,
    borderRadius: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  store: {
    color: INK,
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  meta: {
    color: INK_MUTED,
    fontFamily: MONO,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  dashed: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: DASH,
    marginVertical: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  itemName: {
    flex: 1,
    color: INK,
    fontFamily: MONO,
    fontSize: 13,
  },
  itemPrice: {
    color: INK,
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: INK,
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  totalValue: {
    color: INK,
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '700',
  },
  barcode: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginTop: 18,
    height: 28,
    justifyContent: 'center',
  },
  bar: {
    height: '100%',
    backgroundColor: INK,
    opacity: 0.75,
  },
}));
