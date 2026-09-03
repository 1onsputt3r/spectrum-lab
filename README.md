# Spectrum Lab 光譜探究工具

一個為學生自行操作設計的單頁光譜分析工具。影像在瀏覽器內處理，不會上傳到伺服器。

## 功能

- 從相機或相簿加入橫向光譜影像
- 選擇水平分析範圍與 RGB／單色通道
- 產生像素—強度曲線並進行移動平均平滑
- 以參考譜線建立線性、二次或三次波長校正
- 匯入舊版 `spectrum-known-_ipad` 使用的校正 CSV
- 計算峰值、背景修正半高值、FWHM 與光譜解析度
- 匯出校正參數及完整光譜 CSV
- 支援 iPad 觸控操作與加入主畫面

## 本機開發

需要 Node.js 22 與 pnpm。

```bash
pnpm install
pnpm dev
```

## 來源與致謝

本工具延續以下專案的功能與操作經驗：

- [PySA](https://github.com/lcrobert/PySA)：波長校正、光譜正規化與影像校直的設計參考
- [spectrum_ipad](https://github.com/1onsputt3r/spectrum_ipad)
- [spectrum-known-_ipad](https://github.com/1onsputt3r/spectrum-known-_ipad)
- [spectrum_FWHM_ipad](https://github.com/1onsputt3r/spectrum_FWHM_ipad)

本版重新實作為現代瀏覽器工具。分析結果需配合實驗條件與儀器校正判讀。

## 授權

Apache License 2.0
