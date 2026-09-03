export type Channel = 'brightness' | 'red' | 'green' | 'blue';

export type SpectrumDatum = {
  pixel: number;
  intensity: number;
  wavelength?: number;
};

export type CalibrationPoint = {
  id: string;
  pixel: number;
  wavelength: number;
};

export type CalibrationModel = {
  degree: number;
  coefficients: number[];
  center: number;
  scale: number;
  r2: number;
};

export type FwhmResult = {
  peakPixel: number;
  peakIntensity: number;
  peakWavelength?: number;
  baseline: number;
  halfMaximum: number;
  leftPixel: number;
  rightPixel: number;
  leftWavelength?: number;
  rightWavelength?: number;
  widthPixels: number;
  widthWavelength?: number;
  resolvingPower?: number;
};

export function extractSpectrum(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  xStart: number,
  xEnd: number,
  yCenter: number,
  bandHeight: number,
  channel: Channel,
): SpectrumDatum[] {
  const firstX = Math.max(0, Math.min(width - 1, Math.round(Math.min(xStart, xEnd))));
  const lastX = Math.max(0, Math.min(width - 1, Math.round(Math.max(xStart, xEnd))));
  const halfBand = Math.max(0, Math.floor(bandHeight / 2));
  const firstY = Math.max(0, Math.round(yCenter) - halfBand);
  const lastY = Math.min(height - 1, Math.round(yCenter) + halfBand);
  const channelIndex = channel === 'red' ? 0 : channel === 'green' ? 1 : channel === 'blue' ? 2 : -1;
  const result: SpectrumDatum[] = [];

  for (let x = firstX; x <= lastX; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = firstY; y <= lastY; y += 1) {
      const offset = (y * width + x) * 4;
      if (channelIndex >= 0) {
        sum += pixels[offset + channelIndex];
      } else {
        sum += (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      }
      count += 1;
    }
    result.push({ pixel: x, intensity: count ? sum / count : 0 });
  }

  return result;
}

export function smoothSpectrum(data: SpectrumDatum[], windowSize: number): SpectrumDatum[] {
  const size = Math.max(1, Math.round(windowSize));
  if (size <= 1) return data.map((point) => ({ ...point }));
  const radius = Math.floor(size / 2);
  const prefix = [0];
  for (const point of data) prefix.push(prefix[prefix.length - 1] + point.intensity);

  return data.map((point, index) => {
    const from = Math.max(0, index - radius);
    const to = Math.min(data.length - 1, index + radius);
    return { ...point, intensity: (prefix[to + 1] - prefix[from]) / (to - from + 1) };
  });
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) throw new Error('校正點的像素位置不可重複');

    for (let value = column; value <= size; value += 1) augmented[column][value] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let value = column; value <= size; value += 1) {
        augmented[row][value] -= factor * augmented[column][value];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

export function fitCalibration(points: CalibrationPoint[], degree: number): CalibrationModel {
  if (points.length < degree + 1) throw new Error(`至少需要 ${degree + 1} 個校正點`);
  const center = points.reduce((sum, point) => sum + point.pixel, 0) / points.length;
  const scale = Math.max(...points.map((point) => Math.abs(point.pixel - center)), 1);
  const normalized = points.map((point) => ({ x: (point.pixel - center) / scale, y: point.wavelength }));
  const size = degree + 1;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);

  for (const point of normalized) {
    for (let row = 0; row < size; row += 1) {
      vector[row] += point.y * point.x ** row;
      for (let column = 0; column < size; column += 1) {
        matrix[row][column] += point.x ** (row + column);
      }
    }
  }

  const coefficients = solveLinearSystem(matrix, vector);
  const mean = points.reduce((sum, point) => sum + point.wavelength, 0) / points.length;
  const predictions = points.map((point) => evaluateCalibration({ degree, coefficients, center, scale, r2: 0 }, point.pixel));
  const residual = points.reduce((sum, point, index) => sum + (point.wavelength - predictions[index]) ** 2, 0);
  const total = points.reduce((sum, point) => sum + (point.wavelength - mean) ** 2, 0);

  return { degree, coefficients, center, scale, r2: total > 0 ? 1 - residual / total : 1 };
}

export function evaluateCalibration(model: CalibrationModel, pixel: number): number {
  const x = (pixel - model.center) / model.scale;
  return model.coefficients.reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0);
}

export function applyCalibration(data: SpectrumDatum[], model: CalibrationModel | null): SpectrumDatum[] {
  if (!model) return data.map((point) => ({ ...point, wavelength: undefined }));
  return data.map((point) => ({ ...point, wavelength: evaluateCalibration(model, point.pixel) }));
}

function interpolateCrossing(a: SpectrumDatum, b: SpectrumDatum, level: number): number {
  const delta = b.intensity - a.intensity;
  if (Math.abs(delta) < 1e-9) return (a.pixel + b.pixel) / 2;
  return a.pixel + ((level - a.intensity) / delta) * (b.pixel - a.pixel);
}

export function calculateFwhm(
  data: SpectrumDatum[],
  requestedPeakPixel: number,
  model: CalibrationModel | null,
): FwhmResult | null {
  if (data.length < 3) return null;
  let peakIndex = data.reduce((best, point, index) =>
    Math.abs(point.pixel - requestedPeakPixel) < Math.abs(data[best].pixel - requestedPeakPixel) ? index : best, 0);
  const searchRadius = Math.max(3, Math.floor(data.length * 0.025));
  const from = Math.max(0, peakIndex - searchRadius);
  const to = Math.min(data.length - 1, peakIndex + searchRadius);
  for (let index = from; index <= to; index += 1) {
    if (data[index].intensity > data[peakIndex].intensity) peakIndex = index;
  }

  const sorted = data.map((point) => point.intensity).sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length * 0.05)] ?? sorted[0] ?? 0;
  const peak = data[peakIndex];
  const halfMaximum = baseline + (peak.intensity - baseline) / 2;

  let leftIndex = peakIndex;
  while (leftIndex > 0 && data[leftIndex].intensity > halfMaximum) leftIndex -= 1;
  let rightIndex = peakIndex;
  while (rightIndex < data.length - 1 && data[rightIndex].intensity > halfMaximum) rightIndex += 1;
  if (data[leftIndex].intensity > halfMaximum || data[rightIndex].intensity > halfMaximum) return null;

  const leftPixel = interpolateCrossing(data[leftIndex], data[leftIndex + 1], halfMaximum);
  const rightPixel = interpolateCrossing(data[rightIndex - 1], data[rightIndex], halfMaximum);
  const widthPixels = rightPixel - leftPixel;
  const peakWavelength = model ? evaluateCalibration(model, peak.pixel) : undefined;
  const leftWavelength = model ? evaluateCalibration(model, leftPixel) : undefined;
  const rightWavelength = model ? evaluateCalibration(model, rightPixel) : undefined;
  const widthWavelength = leftWavelength !== undefined && rightWavelength !== undefined
    ? Math.abs(rightWavelength - leftWavelength)
    : undefined;

  return {
    peakPixel: peak.pixel,
    peakIntensity: peak.intensity,
    peakWavelength,
    baseline,
    halfMaximum,
    leftPixel,
    rightPixel,
    leftWavelength,
    rightWavelength,
    widthPixels,
    widthWavelength,
    resolvingPower: peakWavelength && widthWavelength ? peakWavelength / widthWavelength : undefined,
  };
}

export function parseCalibrationCsv(csv: string): CalibrationModel | null {
  const values: Record<string, number> = {};
  for (const rawLine of csv.split(/\r?\n/)) {
    const [rawKey, rawValue] = rawLine.split(',');
    const key = rawKey?.trim();
    const value = Number(rawValue);
    if (key && Number.isFinite(value)) values[key] = value;
  }

  if (Number.isFinite(values.regressionSlope) && Number.isFinite(values.regressionIntercept)) {
    return { degree: 1, coefficients: [values.regressionIntercept, values.regressionSlope], center: 0, scale: 1, r2: 1 };
  }

  const degree = Math.max(1, Math.min(3, Math.round(values.degree ?? 1)));
  const coefficients = Array.from({ length: degree + 1 }, (_, index) => values[`coefficient${index}`]);
  if (coefficients.some((value) => !Number.isFinite(value))) return null;
  return {
    degree,
    coefficients,
    center: Number.isFinite(values.center) ? values.center : 0,
    scale: Number.isFinite(values.scale) && values.scale !== 0 ? values.scale : 1,
    r2: Number.isFinite(values.r2) ? values.r2 : 1,
  };
}

export function calibrationEquation(model: CalibrationModel): string {
  if (model.degree === 1) {
    const slope = model.coefficients[1] / model.scale;
    const intercept = model.coefficients[0] - slope * model.center;
    return `λ = ${slope.toFixed(6)} × x ${intercept >= 0 ? '+' : '−'} ${Math.abs(intercept).toFixed(3)}`;
  }
  const labels = ['常數', '一次', '二次', '三次'];
  return `${labels[model.degree]}多項式校正（R² = ${model.r2.toFixed(5)}）`;
}
