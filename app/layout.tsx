import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '光譜探究工具｜Spectrum Lab',
  description: '為學生設計的光譜影像、波長校正與峰值分析工具。影像只在裝置內處理。',
  manifest: './manifest.webmanifest',
  icons: [{ rel: 'icon', url: './favicon.svg', type: 'image/svg+xml' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
