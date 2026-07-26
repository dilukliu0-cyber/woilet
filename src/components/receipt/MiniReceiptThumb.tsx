import { StyleSheet, View } from 'react-native';
import { themedStyles } from '../../theme/themedStyles';

// Заменяет реальное фото чека в маленьких превью (список расходов,
// шапка экрана чека): миниатюра самого DigitalReceipt — строчки
// «товар … цена» и жирная строка итога, — а не общая иконка документа,
// чтобы силуэт сразу читался именно как чек.
type Props = {
  width?: number;
  height?: number;
};

const PAPER_BG = '#FBF8EF';
const LINE = '#DDD4BC';
const INK = '#4A4530';

const ITEM_ROWS = [
  { item: 0.4, price: 0.18 },
  { item: 0.5, price: 0.15 },
  { item: 0.32, price: 0.2 },
];

export function MiniReceiptThumb({ width = 48, height = 60 }: Props) {
  const scale = width / 48;
  const lineH = Math.max(1.5, 2 * scale);
  const gap = Math.max(2, 3 * scale);

  return (
    <View style={[styles.wrap, { width, height, padding: 5 * scale, gap }]}>
      <View style={[styles.headerLine, { height: lineH + 1, borderRadius: (lineH + 1) / 2 }]} />
      {ITEM_ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          <View
            style={[
              styles.itemLine,
              { width: `${row.item * 100}%`, height: lineH, borderRadius: lineH / 2 },
            ]}
          />
          <View
            style={[
              styles.itemLine,
              { width: `${row.price * 100}%`, height: lineH, borderRadius: lineH / 2 },
            ]}
          />
        </View>
      ))}
      <View style={styles.dashed} />
      <View style={styles.row}>
        <View style={[styles.totalLine, { width: '34%', height: lineH + 1, borderRadius: (lineH + 1) / 2 }]} />
        <View style={[styles.totalLine, { width: '26%', height: lineH + 1, borderRadius: (lineH + 1) / 2 }]} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    backgroundColor: PAPER_BG,
    borderRadius: 8,
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  headerLine: {
    width: '58%',
    alignSelf: 'center',
    backgroundColor: INK,
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLine: {
    backgroundColor: LINE,
  },
  dashed: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: LINE,
  },
  totalLine: {
    backgroundColor: INK,
    opacity: 0.75,
  },
}));
