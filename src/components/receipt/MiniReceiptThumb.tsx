import { Receipt as ReceiptIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { themedStyles } from '../../theme/themedStyles';

// Заменяет реальное фото чека в маленьких превью (список расходов,
// шапка экрана чека): вместо фотографии — символичная «бумажная»
// карточка со строчками текста, чтобы визуально читалось «это чек»,
// но без реального фото.
type Props = {
  width?: number;
  height?: number;
  color?: string;
};

const PAPER_BG = '#FAF6EC';
const PAPER_LINE = '#D9D0BC';
const PAPER_ICON = '#B8AD91';

export function MiniReceiptThumb({ width = 48, height = 60, color }: Props) {
  const paper = color ?? PAPER_BG;
  return (
    <View style={[styles.wrap, { width, height, backgroundColor: paper }]}>
      <ReceiptIcon color={PAPER_ICON} size={Math.round(Math.min(width, height) * 0.34)} strokeWidth={1.6} />
      <View style={styles.lines}>
        <View style={[styles.line, { width: '80%' }]} />
        <View style={[styles.line, { width: '55%' }]} />
        <View style={[styles.line, { width: '68%' }]} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  lines: {
    width: '76%',
    gap: 3,
    alignItems: 'center',
  },
  line: {
    height: 2,
    borderRadius: 1,
    backgroundColor: PAPER_LINE,
  },
}));
