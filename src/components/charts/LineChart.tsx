import { Fragment } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { niceScale, shortAmount } from './chartScale';

type Props = {
  data: number[];
  // Подписи по оси X (день месяца по индексу). По умолчанию — номера 1..N.
  labels?: string[];
  height?: number;
  color?: string;
};

// Ширина viewBox — реальный размер задаётся width="100%", SVG масштабируется.
const VW = 340;

// Динамика расходов: сглаженная линия с заливкой и осями (диаграмма №3).
export function LineChart({ data, labels, height = 190, color = colors.accent }: Props) {
  if (data.length < 2) {
    return <View style={{ height }} />;
  }

  const padL = 40;
  const padR = 10;
  const padT = 12;
  const padB = 24;
  const plotW = VW - padL - padR;
  const plotH = height - padT - padB;

  const { max: niceMax, ticks } = niceScale(Math.max(...data));
  const stepX = plotW / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: padL + i * stepX,
    y: padT + (1 - v / niceMax) * plotH,
  }));

  let line = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const mx = (p.x + c.x) / 2;
    line += ` C ${mx} ${p.y}, ${mx} ${c.y}, ${c.x} ${c.y}`;
  }
  const labelCount = Math.min(5, data.length);
  const xIdx =
    labelCount <= 1
      ? [0]
      : Array.from({ length: labelCount }, (_, k) => Math.round((k * (data.length - 1)) / (labelCount - 1)));

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VW} ${height}`}>
      {ticks.map((t, i) => {
        const y = padT + (1 - t / niceMax) * plotH;
        return (
          <Fragment key={`g${i}`}>
            <Line
              x1={padL}
              y1={y}
              x2={VW - padR}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <SvgText x={padL - 6} y={y + 3} fontSize={9} fill={colors.textTertiary} textAnchor="end">
              {shortAmount(t)}
            </SvgText>
          </Fragment>
        );
      })}

      <Path
        d={line}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {xIdx.map((idx, i) => (
        <SvgText
          key={`x${i}`}
          x={pts[idx].x}
          y={height - 6}
          fontSize={9}
          fill={colors.textTertiary}
          textAnchor="middle"
        >
          {labels?.[idx] ?? `${idx + 1}`}
        </SvgText>
      ))}
    </Svg>
  );
}
