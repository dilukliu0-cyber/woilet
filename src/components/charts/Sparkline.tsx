import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme/colors';

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
};

// Плавный линейный мини-график без точек и подсветки.
export function Sparkline({ data, width = 300, height = 80, color = colors.accent }: Props) {
  if (data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 6;
  const stepX = (width - pad * 2) / (data.length - 1);

  const points = data.map((value, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - (value - min) / range) * (height - pad * 2),
  }));

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    linePath += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return (
    <Svg width={width} height={height}>
      <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
