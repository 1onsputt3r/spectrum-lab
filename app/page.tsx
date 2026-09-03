'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  Download,
  FileDown,
  ImagePlus,
  LockKeyhole,
  RotateCcw,
  Ruler,
  Sparkles,
  Target,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react';

import { SpectrumChart } from '@/components/spectrum-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  applyCalibration,
  calculateFwhm,
  calibrationEquation,
  extractSpectrum,
  fitCalibration,
  parseCalibrationCsv,
  smoothSpectrum,
  type CalibrationModel,
  type CalibrationPoint,
  type Channel,
  type SpectrumDatum,
} from '@/lib/spectrum';

type ImageState = {
  element: HTMLImageElement;
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

const steps = [
  ['01', '加入影像', 'step-image'],
  ['02', '選擇範圍', 'step-range'],
  ['03', '波長校正', 'step-calibration'],
  ['04', '峰值分析', 'step-peak'],
] as const;

const referenceLines = [
  ['自訂波長', ''],
  ['汞 Hg｜404.66 nm', '404.66'],
  ['汞 Hg｜435.83 nm', '435.83'],
  ['汞 Hg｜546.07 nm', '546.07'],
  ['汞 Hg｜576.96 nm', '576.96'],
  ['汞 Hg｜579.07 nm', '579.07'],
  ['氫 H｜434.05 nm', '434.05'],
  ['氫 Hβ｜486.13 nm', '486.13'],
  ['氫 Hα｜656.28 nm', '656.28'],
  ['鈉 Na｜588.99 nm', '588.99'],
  ['鈉 Na｜589.59 nm', '589.59'],
  ['氖 Ne｜585.25 nm', '585.25'],
  ['氖 Ne｜603.00 nm', '603.00'],
  ['氖 Ne｜614.31 nm', '614.31'],
  ['氖 Ne｜640.22 nm', '640.22'],
  ['氖 Ne｜703.24 nm', '703.24'],
];

const channelLabels: Record<Channel, string> = {
  brightness: 'RGB 平均亮度',
  red: '紅色通道',
  green: '綠色通道',
  blue: '藍色通道',
};

function downloadText(content: string, fileName: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sliderValue(value: number | readonly number[]): number {
  return typeof value === 'number' ? value : (value[0] ?? 0);
}

function SectionHeading({ number, eyebrow, title, description }: { number: string; eyebrow: string; title: string; description: string }) {
  return (
    <div className="border-b border-border bg-[linear-gradient(120deg,rgba(12,113,118,0.09),rgba(255,184,77,0.08),transparent_70%)] px-5 py-5 sm:px-7">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">{number}</span>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, unit, emphasis = false }: { label: string; value: string; unit?: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis ? 'border-primary/30 bg-primary/[0.055]' : 'border-border bg-background/70'}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold tracking-tight ${emphasis ? 'text-primary' : ''}`}>
        {value}{unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

export default function Home() {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageState | null>(null);
  const [xRange, setXRange] = useState([0, 100]);
  const [yCenter, setYCenter] = useState(50);
  const [bandHeight, setBandHeight] = useState(10);
  const [channel, setChannel] = useState<Channel>('brightness');
  const [smoothing, setSmoothing] = useState(3);
  const [rawSpectrum, setRawSpectrum] = useState<SpectrumDatum[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [degree, setDegree] = useState(1);
  const [model, setModel] = useState<CalibrationModel | null>(null);
  const [calibrationPixel, setCalibrationPixel] = useState(50);
  const [calibrationWavelength, setCalibrationWavelength] = useState('546.07');
  const [peakPixel, setPeakPixel] = useState(50);
  const [message, setMessage] = useState('請先加入一張光譜影像');

  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = image.width;
    canvas.height = image.height;
    context.drawImage(image.element, 0, 0, image.width, image.height);

    const firstX = Math.min(xRange[0], xRange[1]);
    const lastX = Math.max(xRange[0], xRange[1]);
    const firstY = Math.max(0, yCenter - bandHeight / 2);
    context.fillStyle = 'rgba(16, 185, 129, 0.17)';
    context.strokeStyle = '#facc15';
    context.lineWidth = Math.max(2, image.width / 700);
    context.fillRect(firstX, firstY, lastX - firstX, bandHeight);
    context.strokeRect(firstX, firstY, lastX - firstX, bandHeight);
  }, [bandHeight, image, xRange, yCenter]);

  const smoothedSpectrum = useMemo(() => smoothSpectrum(rawSpectrum, smoothing), [rawSpectrum, smoothing]);
  const calibratedSpectrum = useMemo(() => applyCalibration(smoothedSpectrum, model), [model, smoothedSpectrum]);
  const fwhm = useMemo(() => calculateFwhm(calibratedSpectrum, peakPixel, model), [calibratedSpectrum, model, peakPixel]);

  const currentStep = model && fwhm ? 4 : model ? 3 : rawSpectrum.length ? 2 : image ? 1 : 0;

  const openPicker = useCallback(() => imageInputRef.current?.click(), []);

  const loadImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const element = new Image();
      element.onload = () => {
        const maximumWidth = 2200;
        const scale = Math.min(1, maximumWidth / element.naturalWidth);
        const width = Math.max(1, Math.round(element.naturalWidth * scale));
        const height = Math.max(1, Math.round(element.naturalHeight * scale));
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const context = offscreen.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(element, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const defaultBand = Math.max(3, Math.round(height * 0.1));
        setImage({ element, name: file.name, width, height, pixels });
        setXRange([0, width - 1]);
        setYCenter(Math.floor(height / 2));
        setBandHeight(defaultBand);
        setCalibrationPixel(Math.floor(width / 2));
        setPeakPixel(Math.floor(width / 2));
        setRawSpectrum([]);
        setCalibrationPoints([]);
        setModel(null);
        setMessage(`已載入 ${file.name}，請調整黃色分析框`);
        window.setTimeout(() => document.getElementById('step-range')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      };
      element.onerror = () => setMessage('無法讀取這張圖片，請改用 JPG、PNG 或 WebP');
      element.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }, []);

  const analyzeImage = useCallback(() => {
    if (!image) return;
    const spectrum = extractSpectrum(
      image.pixels,
      image.width,
      image.height,
      xRange[0],
      xRange[1],
      yCenter,
      bandHeight,
      channel,
    );
    setRawSpectrum(spectrum);
    const strongest = spectrum.reduce((best, point) => point.intensity > best.intensity ? point : best, spectrum[0]);
    setPeakPixel(strongest.pixel);
    setCalibrationPixel(strongest.pixel);
    setMessage(`分析完成：取得 ${spectrum.length.toLocaleString()} 個光譜資料點`);
    window.setTimeout(() => document.getElementById('step-calibration')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }, [bandHeight, channel, image, xRange, yCenter]);

  const addCalibrationPoint = useCallback(() => {
    const wavelength = Number(calibrationWavelength);
    if (!Number.isFinite(wavelength) || wavelength <= 0) {
      setMessage('請輸入正確的參考波長');
      return;
    }
    if (calibrationPoints.some((point) => point.pixel === calibrationPixel)) {
      setMessage('這個像素位置已經加入校正');
      return;
    }
    setCalibrationPoints((points) => [...points, { id: crypto.randomUUID(), pixel: calibrationPixel, wavelength }].sort((a, b) => a.pixel - b.pixel));
    setModel(null);
    setMessage(`已加入校正點：像素 ${calibrationPixel} → ${wavelength.toFixed(2)} nm`);
  }, [calibrationPixel, calibrationPoints, calibrationWavelength]);

  const runCalibration = useCallback(() => {
    try {
      const fitted = fitCalibration(calibrationPoints, degree);
      setModel(fitted);
      setMessage(`校正完成，R² = ${fitted.r2.toFixed(5)}`);
      window.setTimeout(() => document.getElementById('step-peak')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '無法完成校正');
    }
  }, [calibrationPoints, degree]);

  const selectStrongestPeak = useCallback(() => {
    if (!smoothedSpectrum.length) return;
    const strongest = smoothedSpectrum.reduce((best, point) => point.intensity > best.intensity ? point : best, smoothedSpectrum[0]);
    setPeakPixel(strongest.pixel);
    setMessage(`已選擇最強峰：像素 ${strongest.pixel}`);
  }, [smoothedSpectrum]);

  const importCalibration = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseCalibrationCsv(typeof reader.result === 'string' ? reader.result : '');
      if (!imported) {
        setMessage('無法辨識這份校正檔案');
        return;
      }
      setModel(imported);
      setDegree(imported.degree);
      setMessage('已匯入校正參數，可以直接進行峰值分析');
    };
    reader.readAsText(file);
  }, []);

  const exportCalibration = useCallback(() => {
    if (!model || !image) return;
    const lines = [
      'parameter,value',
      `degree,${model.degree}`,
      `center,${model.center}`,
      `scale,${model.scale}`,
      `r2,${model.r2}`,
      ...model.coefficients.map((value, index) => `coefficient${index},${value}`),
      `xStart,${Math.min(...xRange)}`,
      `xEnd,${Math.max(...xRange)}`,
    ];
    if (model.degree === 1) {
      const slope = model.coefficients[1] / model.scale;
      const intercept = model.coefficients[0] - slope * model.center;
      lines.push(`regressionSlope,${slope}`, `regressionIntercept,${intercept}`);
    }
    lines.push('calibration_index,pixel,wavelength');
    calibrationPoints.forEach((point, index) => lines.push(`${index + 1},${point.pixel},${point.wavelength}`));
    downloadText(`\ufeff${lines.join('\n')}`, `${image.name.replace(/\.[^.]+$/, '')}_calibration.csv`);
  }, [calibrationPoints, image, model, xRange]);

  const exportSpectrum = useCallback(() => {
    if (!image || !calibratedSpectrum.length) return;
    const lines = ['pixel,wavelength_nm,intensity'];
    calibratedSpectrum.forEach((point) => lines.push(`${point.pixel},${point.wavelength?.toFixed(6) ?? ''},${point.intensity.toFixed(6)}`));
    if (fwhm) {
      lines.push('', 'measurement,value,unit');
      lines.push(`peak_pixel,${fwhm.peakPixel},px`, `peak_intensity,${fwhm.peakIntensity.toFixed(6)},a.u.`, `fwhm_pixel,${fwhm.widthPixels.toFixed(6)},px`);
      if (fwhm.peakWavelength !== undefined) lines.push(`peak_wavelength,${fwhm.peakWavelength.toFixed(6)},nm`);
      if (fwhm.widthWavelength !== undefined) lines.push(`fwhm_wavelength,${fwhm.widthWavelength.toFixed(6)},nm`);
      if (fwhm.resolvingPower !== undefined) lines.push(`resolving_power,${fwhm.resolvingPower.toFixed(6)},lambda/delta_lambda`);
    }
    downloadText(`\ufeff${lines.join('\n')}`, `${image.name.replace(/\.[^.]+$/, '')}_spectrum.csv`);
  }, [calibratedSpectrum, fwhm, image]);

  const resetAll = useCallback(() => {
    setImage(null);
    setRawSpectrum([]);
    setCalibrationPoints([]);
    setModel(null);
    setMessage('請先加入一張光譜影像');
    if (imageInputRef.current) imageInputRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const maximumX = image ? image.width - 1 : 100;
  const maximumY = image ? image.height - 1 : 100;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="spectrum-mark" aria-hidden="true" />
            <div>
              <p className="text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">Spectrum Lab</p>
              <h1 className="text-base font-bold tracking-tight sm:text-xl">光譜探究工具</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <LockKeyhole className="size-3.5 text-emerald-600" />影像只在這台裝置處理
            </div>
            {(image || rawSpectrum.length > 0) && <Button variant="ghost" size="sm" onClick={resetAll}><RotateCcw />重新開始</Button>}
          </div>
        </div>
        <div aria-live="polite" className="border-t border-border/50 bg-primary/5 px-4 py-1.5 text-center text-xs font-medium text-primary">{message}</div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-9">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="rounded-3xl border border-border bg-card p-3 shadow-sm" aria-label="分析步驟">
            <div className="mb-3 flex items-center gap-2 px-2 py-1"><Sparkles className="size-4 text-primary" /><p className="text-sm font-semibold">分析進度</p></div>
            <ol className="grid grid-cols-4 gap-1.5 lg:grid-cols-1">
              {steps.map(([number, label, id], index) => {
                const stepNumber = index + 1;
                const complete = currentStep >= stepNumber;
                const active = currentStep + 1 === stepNumber || (stepNumber === 4 && currentStep === 4);
                return (
                  <li key={number}>
                    <button
                      type="button"
                      onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition ${active ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${complete ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        {complete ? <Check className="size-4" /> : number}
                      </span>
                      <span className="hidden flex-1 truncate text-sm font-medium lg:block">{label}</span>
                      <ChevronRight className="hidden size-4 lg:block" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="mt-3 hidden rounded-2xl border border-border bg-card/70 p-4 text-xs leading-5 text-muted-foreground lg:block">
            <p className="font-semibold text-foreground">操作提示</p>
            <p className="mt-1">每一步完成後會自動帶你到下一步。你也可以隨時回到前一步調整。</p>
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          <article id="step-image" className="scroll-mt-24 overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_20px_60px_rgba(26,54,65,0.07)]">
            <SectionHeading number="1" eyebrow="第一步" title="加入光譜影像" description="拍攝或選擇一張橫向光譜照片。建議避免過度曝光，並讓譜線盡量垂直、色帶保持水平。" />
            <div className="p-5 sm:p-7">
              <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadImage(file); }} />
              {image ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-5" /></span>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{image.name}</p><p className="text-xs text-emerald-800/70">分析尺寸 {image.width} × {image.height} px</p></div>
                  </div>
                  <Button variant="outline" size="lg" onClick={openPicker}>更換影像</Button>
                </div>
              ) : (
                <button type="button" aria-label="拍照或選擇光譜影像" onClick={openPicker} className="group grid min-h-[300px] w-full place-items-center rounded-3xl border-2 border-dashed border-primary/25 bg-primary/[0.025] p-8 text-center transition hover:border-primary/60 hover:bg-primary/[0.045] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                  <span>
                    <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary transition group-hover:scale-105"><ImagePlus className="size-9" /></span>
                    <span className="mt-5 block text-xl font-bold">點一下選擇影像</span>
                    <span className="mt-2 block text-sm leading-6 text-muted-foreground">支援 JPG、PNG 與 WebP<br />所有分析都在瀏覽器內完成</span>
                    <span className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Camera className="size-4" />拍照或從照片選取</span>
                  </span>
                </button>
              )}
            </div>
          </article>

          <article id="step-range" className={`scroll-mt-24 overflow-hidden rounded-[2rem] border bg-card shadow-[0_20px_60px_rgba(26,54,65,0.07)] ${image ? 'border-border' : 'pointer-events-none border-border opacity-50'}`}>
            <SectionHeading number="2" eyebrow="第二步" title="選擇分析範圍" description="用滑桿把黃色框放在清楚的光譜色帶上。程式會沿著框內每一欄取平均亮度，減少雜訊。" />
            <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
              <div>
                <div className="overflow-hidden rounded-2xl border border-border bg-slate-950">
                  {image ? <canvas ref={canvasRef} className="block h-auto max-h-[560px] w-full object-contain" aria-label="光譜影像與目前分析範圍" /> : <div className="grid min-h-[300px] place-items-center text-sm text-slate-400">請先加入影像</div>}
                </div>
                {rawSpectrum.length > 0 && <div className="mt-5 rounded-2xl border border-border bg-background/70 p-3"><SpectrumChart data={smoothedSpectrum} /></div>}
              </div>
              <div className="space-y-5">
                <div className="control-panel">
                  <div className="flex items-center justify-between"><Label>左右範圍</Label><span className="value-chip">{Math.min(...xRange)}–{Math.max(...xRange)} px</span></div>
                  <Slider min={0} max={maximumX} step={1} value={xRange} onValueChange={(value) => { setXRange(value as number[]); setRawSpectrum([]); setModel(null); }} className="mt-4" />
                </div>
                <div className="control-panel">
                  <div className="flex items-center justify-between"><Label>色帶中央位置</Label><span className="value-chip">Y = {Math.round(yCenter)}</span></div>
                  <Slider min={0} max={maximumY} step={1} value={[yCenter]} onValueChange={(value) => { setYCenter(sliderValue(value)); setRawSpectrum([]); }} className="mt-4" />
                </div>
                <div className="control-panel">
                  <div className="flex items-center justify-between"><Label>取樣高度</Label><span className="value-chip">{Math.round(bandHeight)} px</span></div>
                  <Slider min={1} max={Math.max(2, Math.round(maximumY * 0.35))} step={1} value={[bandHeight]} onValueChange={(value) => { setBandHeight(sliderValue(value)); setRawSpectrum([]); }} className="mt-4" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div><Label htmlFor="channel">分析通道</Label><select id="channel" className="select-control mt-2" value={channel} onChange={(event) => { setChannel(event.target.value as Channel); setRawSpectrum([]); }}>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div><Label htmlFor="smoothing">平滑程度</Label><select id="smoothing" className="select-control mt-2" value={smoothing} onChange={(event) => setSmoothing(Number(event.target.value))}><option value="1">不平滑</option><option value="3">輕微（3 點）</option><option value="5">一般（5 點）</option><option value="9">較強（9 點）</option></select></div>
                </div>
                <Button size="lg" className="h-12 w-full text-base" disabled={!image} onClick={analyzeImage}><Activity />產生強度曲線</Button>
              </div>
            </div>
          </article>

          <article id="step-calibration" className={`scroll-mt-24 overflow-hidden rounded-[2rem] border bg-card shadow-[0_20px_60px_rgba(26,54,65,0.07)] ${rawSpectrum.length ? 'border-border' : 'pointer-events-none border-border opacity-50'}`}>
            <SectionHeading number="3" eyebrow="第三步" title="建立波長刻度" description="在強度圖中找出已知譜線的像素位置，加入至少兩點即可校正；也可以匯入你之前工具輸出的 CSV。" />
            <div className="space-y-6 p-5 sm:p-7">
              {rawSpectrum.length > 0 && <div className="rounded-2xl border border-border bg-background/70 p-3"><SpectrumChart data={smoothedSpectrum} /></div>}
              <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                <div className="space-y-4 rounded-3xl border border-border bg-background/55 p-5">
                  <div className="flex items-center gap-2"><Target className="size-5 text-primary" /><h3 className="font-bold">加入校正點</h3></div>
                  <div className="control-panel bg-card">
                    <div className="flex items-center justify-between"><Label>譜線像素位置</Label><span className="value-chip">X = {Math.round(calibrationPixel)}</span></div>
                    <Slider min={Math.min(...xRange)} max={Math.max(...xRange)} step={1} value={[calibrationPixel]} onValueChange={(value) => setCalibrationPixel(sliderValue(value))} className="mt-4" />
                  </div>
                  <div><Label htmlFor="reference-line">參考譜線</Label><select id="reference-line" className="select-control mt-2" value={calibrationWavelength} onChange={(event) => setCalibrationWavelength(event.target.value)}>{referenceLines.map(([label, value]) => <option key={`${label}-${value}`} value={value}>{label}</option>)}</select></div>
                  <div><Label htmlFor="wavelength">波長（nm）</Label><Input id="wavelength" type="number" inputMode="decimal" min="1" step="0.01" className="mt-2 h-11 text-base" value={calibrationWavelength} onChange={(event) => setCalibrationWavelength(event.target.value)} placeholder="例如 546.07" /></div>
                  <Button size="lg" className="h-11 w-full" onClick={addCalibrationPoint}><Target />加入這個校正點</Button>
                </div>

                <div className="space-y-4 rounded-3xl border border-border bg-background/55 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><WandSparkles className="size-5 text-primary" /><h3 className="font-bold">校正資料</h3></div><Badge variant="secondary">{calibrationPoints.length} 點</Badge></div>
                  {calibrationPoints.length ? (
                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                      {calibrationPoints.map((point, index) => (
                        <div key={point.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                          <span className="flex-1 font-mono">{point.pixel} px → {point.wavelength.toFixed(2)} nm</span>
                          <button type="button" aria-label="刪除校正點" onClick={() => { setCalibrationPoints((points) => points.filter((item) => item.id !== point.id)); setModel(null); }} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                        </div>
                      ))}
                    </div>
                  ) : <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">尚未加入校正點</div>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label htmlFor="degree">回歸模型</Label><select id="degree" className="select-control mt-2" value={degree} onChange={(event) => { setDegree(Number(event.target.value)); setModel(null); }}><option value="1">線性（建議）</option><option value="2">二次多項式</option><option value="3">三次多項式</option></select></div>
                    <div><Label htmlFor="calibration-file">已有校正檔</Label><label htmlFor="calibration-file" className="mt-2 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"><Upload className="size-4" />匯入 CSV</label><input id="calibration-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) importCalibration(file); }} /></div>
                  </div>
                  <Button size="lg" variant="secondary" className="h-11 w-full" disabled={calibrationPoints.length < degree + 1} onClick={runCalibration}><WandSparkles />計算校正曲線</Button>
                </div>
              </div>
              {model && (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">校正完成</p><p className="mt-1 font-mono text-sm font-bold text-emerald-950 sm:text-base">{calibrationEquation(model)}</p></div><Button variant="outline" onClick={exportCalibration}><FileDown />下載校正 CSV</Button></div>
                </div>
              )}
            </div>
          </article>

          <article id="step-peak" className={`scroll-mt-24 overflow-hidden rounded-[2rem] border bg-card shadow-[0_20px_60px_rgba(26,54,65,0.07)] ${rawSpectrum.length ? 'border-border' : 'pointer-events-none border-border opacity-50'}`}>
            <SectionHeading number="4" eyebrow="第四步" title="測量峰值與 FWHM" description="選擇要測量的峰，工具會以背景強度修正後的半高值，內插左右交點並計算半高全寬。" />
            <div className="space-y-6 p-5 sm:p-7">
              {rawSpectrum.length > 0 && <div className="rounded-2xl border border-border bg-background/70 p-3"><SpectrumChart data={calibratedSpectrum} calibrated={Boolean(model)} fwhm={fwhm} /></div>}
              <div className="grid gap-5 xl:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
                <div className="space-y-4 rounded-3xl border border-border bg-background/55 p-5">
                  <div className="flex items-center gap-2"><Ruler className="size-5 text-primary" /><h3 className="font-bold">選擇測量峰</h3></div>
                  <div className="control-panel bg-card"><div className="flex items-center justify-between"><Label>峰值附近位置</Label><span className="value-chip">X = {Math.round(peakPixel)}</span></div><Slider min={Math.min(...xRange)} max={Math.max(...xRange)} step={1} value={[peakPixel]} onValueChange={(value) => setPeakPixel(sliderValue(value))} className="mt-4" /></div>
                  <Button variant="outline" size="lg" className="h-11 w-full" onClick={selectStrongestPeak}><Sparkles />自動選擇最強峰</Button>
                  <p className="rounded-xl bg-accent/55 p-3 text-xs leading-5 text-accent-foreground">背景值取整條曲線中最低 5% 的代表值；左右半高交點採線性內插，因此結果可小於一個像素。</p>
                </div>
                <div>
                  {fwhm ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Metric label="峰值位置" value={fwhm.peakWavelength !== undefined ? fwhm.peakWavelength.toFixed(2) : fwhm.peakPixel.toFixed(0)} unit={fwhm.peakWavelength !== undefined ? 'nm' : 'px'} emphasis />
                      <Metric label="峰值強度" value={fwhm.peakIntensity.toFixed(2)} unit="a.u." />
                      <Metric label="半高值" value={fwhm.halfMaximum.toFixed(2)} unit="a.u." />
                      <Metric label="FWHM（像素）" value={fwhm.widthPixels.toFixed(2)} unit="px" emphasis />
                      <Metric label="FWHM（波長）" value={fwhm.widthWavelength !== undefined ? fwhm.widthWavelength.toFixed(3) : '待校正'} unit={fwhm.widthWavelength !== undefined ? 'nm' : undefined} />
                      <Metric label="光譜解析度 R" value={fwhm.resolvingPower !== undefined ? fwhm.resolvingPower.toFixed(1) : '待校正'} unit={fwhm.resolvingPower !== undefined ? 'λ/Δλ' : undefined} />
                    </div>
                  ) : <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-border bg-background/55 p-6 text-center"><div><Target className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">找不到完整的半高交點</p><p className="mt-1 text-sm text-muted-foreground">請把峰值滑桿移到完整、沒有貼近圖表邊界的峰。</p></div></div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-foreground px-5 py-4 text-background">
                <div><p className="font-semibold">分析完成後，下載資料供試算表或報告使用</p><p className="mt-0.5 text-xs text-background/65">包含像素、波長、強度與 FWHM 測量結果</p></div>
                <Button size="lg" className="h-11 bg-background text-foreground hover:bg-background/90" disabled={!rawSpectrum.length} onClick={exportSpectrum}><Download />下載分析 CSV</Button>
              </div>
            </div>
          </article>

          <footer className="px-2 pb-8 pt-2 text-center text-xs leading-5 text-muted-foreground">
            Spectrum Lab 第一版整合 PySA 的波長校正概念與既有 iPad 網頁工具操作流程。測量結果應搭配實驗條件與儀器校正判讀。
          </footer>
        </section>
      </div>
    </main>
  );
}
