'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { FwhmResult, SpectrumDatum } from '@/lib/spectrum';

const chartConfig = {
  intensity: { label: '強度', color: 'var(--chart-1)' },
};

type Props = {
  data: SpectrumDatum[];
  calibrated?: boolean;
  fwhm?: FwhmResult | null;
};

export function SpectrumChart({ data, calibrated = false, fwhm }: Props) {
  const stride = Math.max(1, Math.ceil(data.length / 1200));
  const chartData = data.filter((_, index) => index % stride === 0 || index === data.length - 1).map((point) => ({
    ...point,
    axis: calibrated ? point.wavelength : point.pixel,
  }));
  const peakAxis = fwhm ? (calibrated ? fwhm.peakWavelength : fwhm.peakPixel) : undefined;
  const leftAxis = fwhm
    ? calibrated && fwhm.leftWavelength !== undefined
      ? fwhm.leftWavelength
      : fwhm.leftPixel
    : undefined;
  const rightAxis = fwhm
    ? calibrated && fwhm.rightWavelength !== undefined
      ? fwhm.rightWavelength
      : fwhm.rightPixel
    : undefined;

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full sm:h-[380px]">
      <LineChart data={chartData} margin={{ top: 16, right: 20, bottom: 14, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="axis"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value) => Number(value).toFixed(0)}
          label={{ value: calibrated ? '波長（nm）' : '像素位置', position: 'insideBottom', offset: -8 }}
          tickMargin={8}
        />
        <YAxis domain={[0, 'auto']} width={46} tickMargin={8} />
        <ChartTooltip
          content={<ChartTooltipContent hideLabel formatter={(value) => <span className="font-mono font-semibold">{Number(value).toFixed(2)}</span>} />}
          labelFormatter={(value) => `${calibrated ? '波長' : '像素'}：${Number(value).toFixed(calibrated ? 2 : 0)}`}
        />
        {fwhm && <ReferenceLine y={fwhm.halfMaximum} stroke="var(--chart-2)" strokeDasharray="5 4" />}
        {leftAxis !== undefined && <ReferenceLine x={leftAxis} stroke="var(--chart-3)" strokeDasharray="4 3" />}
        {rightAxis !== undefined && <ReferenceLine x={rightAxis} stroke="var(--chart-3)" strokeDasharray="4 3" />}
        {peakAxis !== undefined && <ReferenceLine x={peakAxis} stroke="var(--chart-2)" strokeWidth={2} />}
        <Line
          type="monotone"
          dataKey="intensity"
          stroke="var(--color-intensity)"
          strokeWidth={2.25}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
