import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import notoSerifRegularUrl from '../assets/fonts/NotoSerif-Regular.ttf?url';
import notoSerifBoldUrl from '../assets/fonts/NotoSerif-Bold.ttf?url';
import notoEthRegularUrl from '../assets/fonts/NotoSansEthiopic-Regular.ttf?url';
import notoEthBoldUrl from '../assets/fonts/NotoSansEthiopic-Bold.ttf?url';
import {
  ADDIS_LOCATIONS,
  DAYS_OF_WEEK,
  EDUCATION_LEVEL_LABELS,
  KID_GRADE_LEVELS,
  SUBJECTS,
  WEEKDAY_SLOTS,
  WEEKEND_SLOTS,
} from '../data/catalog';
import type {
  ParentApplication,
  TutorAcademicRecords,
  TutorProfileData,
  UploadedImageDoc,
  UploadedPdfDoc,
} from '../types/app';
import { getImageBytes, getPdfBytes } from './api';

// Synchronous in-bundle PDF.js worker eliminates external .mjs worker fetch failures
// across static hosts, offline file:// bundles, and mobile browsers.
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
}

const A4_W = 595.28;
const A4_H = 841.89;
const PAGE_MARGIN = 42;

export interface PreviewPageItem {
  url: string;
  caption: string;
  kind: 'summary' | 'national_id' | 'document';
}

interface VectorFonts {
  serifReg: PDFFont;
  serifBold: PDFFont;
  ethReg: PDFFont;
  ethBold: PDFFont;
}

interface FontBytesCache {
  serifReg: ArrayBuffer;
  serifBold: ArrayBuffer;
  ethReg: ArrayBuffer;
  ethBold: ArrayBuffer;
}

let fontBytesPromise: Promise<FontBytesCache> | null = null;

async function loadFontBytes(): Promise<FontBytesCache> {
  if (!fontBytesPromise) {
    fontBytesPromise = Promise.all([
      fetch(notoSerifRegularUrl).then((r) => r.arrayBuffer()),
      fetch(notoSerifBoldUrl).then((r) => r.arrayBuffer()),
      fetch(notoEthRegularUrl).then((r) => r.arrayBuffer()),
      fetch(notoEthBoldUrl).then((r) => r.arrayBuffer()),
    ]).then(([serifReg, serifBold, ethReg, ethBold]) => ({
      serifReg,
      serifBold,
      ethReg,
      ethBold,
    }));
  }
  return fontBytesPromise;
}

async function embedVectorFonts(pdfDoc: PDFDocument): Promise<VectorFonts> {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const [serifReg, serifBold, ethReg, ethBold] = await Promise.all([
    pdfDoc.embedFont(bytes.serifReg, { subset: true }),
    pdfDoc.embedFont(bytes.serifBold, { subset: true }),
    pdfDoc.embedFont(bytes.ethReg, { subset: true }),
    pdfDoc.embedFont(bytes.ethBold, { subset: true }),
  ]);
  return { serifReg, serifBold, ethReg, ethBold };
}

const ETHIOPIC_RUN_RE = /([\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]+)/g;
const ETHIOPIC_TEST_RE = /^[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]+$/;

function sanitizeUnsupportedChars(text: string): string {
  // Preserve Ethiopic, Latin, common punctuation, dashes, currency, symbols; strip stray emojis
  return (text || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
}

function splitRuns(text: string, isBold: boolean, fonts: VectorFonts) {
  const clean = sanitizeUnsupportedChars(text);
  const parts = clean.split(ETHIOPIC_RUN_RE).filter((p) => p.length > 0);
  return parts.map((segment) => ({
    segment,
    font: ETHIOPIC_TEST_RE.test(segment)
      ? isBold
        ? fonts.ethBold
        : fonts.ethReg
      : isBold
      ? fonts.serifBold
      : fonts.serifReg,
  }));
}

function measureVectorWidth(text: string, size: number, isBold: boolean, fonts: VectorFonts): number {
  let total = 0;
  for (const run of splitRuns(text, isBold, fonts)) {
    try {
      total += run.font.widthOfTextAtSize(run.segment, size);
    } catch {
      total += run.segment.length * size * 0.52;
    }
  }
  return total;
}

function drawVectorText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  isBold: boolean,
  fonts: VectorFonts,
  color = rgb(0.06, 0.09, 0.16)
) {
  let cursorX = x;
  for (const run of splitRuns(text, isBold, fonts)) {
    try {
      page.drawText(run.segment, { x: cursorX, y, size, font: run.font, color });
      cursorX += run.font.widthOfTextAtSize(run.segment, size);
    } catch {
      const asciiFallback = run.segment.replace(/[^\x20-\x7E]/g, ' ');
      page.drawText(asciiFallback, { x: cursorX, y, size, font: fonts.serifReg, color });
      cursorX += fonts.serifReg.widthOfTextAtSize(asciiFallback, size);
    }
  }
}

function wrapVectorText(
  text: string,
  maxWidth: number,
  size: number,
  isBold: boolean,
  fonts: VectorFonts
): string[] {
  const clean = sanitizeUnsupportedChars(text);
  if (!clean) return ['—'];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureVectorWidth(candidate, size, isBold, fonts) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['—'];
}

interface SheetLine {
  type: 'section' | 'row' | 'note' | 'spacer';
  label?: string;
  value?: string;
}

function drawVectorHeaderAndFooter(
  page: PDFPage,
  title: string,
  subtitle: string,
  pageNumber: number,
  fonts: VectorFonts
) {
  const bannerH = 82;
  page.drawRectangle({
    x: 0,
    y: A4_H - bannerH,
    width: A4_W,
    height: bannerH,
    color: rgb(0.078, 0.325, 0.176),
  });
  page.drawRectangle({
    x: 0,
    y: A4_H - bannerH - 3,
    width: A4_W,
    height: 3,
    color: rgb(0.133, 0.773, 0.369),
  });

  drawVectorText(page, title, PAGE_MARGIN, A4_H - 36, 16, true, fonts, rgb(1, 1, 1));
  drawVectorText(page, subtitle, PAGE_MARGIN, A4_H - 58, 10, false, fonts, rgb(0.86, 0.99, 0.9));

  // Bottom rule & crisp vector footer
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: 42,
    width: A4_W - PAGE_MARGIN * 2,
    height: 0.75,
    color: rgb(0.86, 0.99, 0.9),
  });
  drawVectorText(
    page,
    `ኣስኳላ Tutors  ·  Page ${pageNumber}  ·  Generated ${new Date().toLocaleDateString()}`,
    PAGE_MARGIN,
    26,
    9,
    false,
    fonts,
    rgb(0.28, 0.33, 0.41)
  );
}

function renderLinesToVectorPages(
  pdfDoc: PDFDocument,
  headerTitle: string,
  headerSubtitle: string,
  lines: SheetLine[],
  fonts: VectorFonts
): number {
  let pageCount = 0;
  let page: PDFPage;
  let y = 0;
  const minY = 58;

  const startNewPage = () => {
    pageCount += 1;
    page = pdfDoc.addPage([A4_W, A4_H]);
    drawVectorHeaderAndFooter(page, headerTitle, headerSubtitle, pageCount, fonts);
    y = A4_H - 112;
  };

  startNewPage();

  const ensureSpace = (needed: number) => {
    if (y - needed < minY) {
      startNewPage();
    }
  };

  const contentW = A4_W - PAGE_MARGIN * 2;
  const labelW = 168;
  const valX = PAGE_MARGIN + labelW + 14;
  const valMaxW = contentW - labelW - 14;

  for (const item of lines) {
    if (item.type === 'spacer') {
      y -= 8;
      continue;
    }

    if (item.type === 'section') {
      ensureSpace(34);
      y -= 8;
      drawVectorText(
        page!,
        item.label || '',
        PAGE_MARGIN,
        y,
        12.5,
        true,
        fonts,
        rgb(0.078, 0.325, 0.176)
      );
      y -= 6;
      page!.drawRectangle({
        x: PAGE_MARGIN,
        y,
        width: contentW,
        height: 1.5,
        color: rgb(0.133, 0.773, 0.369),
      });
      y -= 18;
      continue;
    }

    if (item.type === 'note') {
      const wrapped = wrapVectorText(item.label || '', contentW, 10, true, fonts);
      ensureSpace(wrapped.length * 14 + 8);
      for (const w of wrapped) {
        drawVectorText(page!, w, PAGE_MARGIN, y, 10, true, fonts, rgb(0.082, 0.502, 0.239));
        y -= 14;
      }
      y -= 4;
      continue;
    }

    if (item.type === 'row') {
      const wrappedLabel = wrapVectorText(item.label || '', labelW, 10, true, fonts);
      const wrappedVal = wrapVectorText(item.value || '—', valMaxW, 10, false, fonts);
      const lineCount = Math.max(wrappedLabel.length, wrappedVal.length);
      const rowHeight = Math.max(18, lineCount * 14 + 6);
      ensureSpace(rowHeight);

      let ly = y;
      for (const lLine of wrappedLabel) {
        drawVectorText(
          page!,
          lLine,
          PAGE_MARGIN,
          ly,
          10,
          true,
          fonts,
          rgb(0.078, 0.325, 0.176)
        );
        ly -= 14;
      }

      let vy = y;
      for (const vLine of wrappedVal) {
        drawVectorText(page!, vLine, valX, vy, 10, false, fonts, rgb(0.059, 0.09, 0.165));
        vy -= 14;
      }

      y -= rowHeight;
      page!.drawRectangle({
        x: PAGE_MARGIN,
        y: y + 4,
        width: contentW,
        height: 0.5,
        color: rgb(0.86, 0.99, 0.9),
      });
    }
  }

  return pageCount;
}

async function embedImageBytesIntoPdf(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
  mimeType = 'image/jpeg'
): Promise<PDFImage> {
  // Detect magic bytes directly so JPEG/PNG never mismatches extension
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return await pdfDoc.embedJpg(bytes);
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return await pdfDoc.embedPng(bytes);
  }
  // Convert WebP or other raster format to crisp PNG before embedding
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image load failed'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))), 'image/png')
    );
    return await pdfDoc.embedPng(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function embedNationalIdVectorPage(
  pdfDoc: PDFDocument,
  frontDoc: UploadedImageDoc | undefined,
  backDoc: UploadedImageDoc | undefined,
  applicantName: string,
  pageNumber: number,
  isAmharic: boolean,
  fonts: VectorFonts
): Promise<boolean> {
  if (!frontDoc && !backDoc) return false;
  const frontBytes = frontDoc ? await getImageBytes(frontDoc.fileId) : null;
  const backBytes = backDoc ? await getImageBytes(backDoc.fileId) : null;
  if (!frontBytes && !backBytes) return false;

  const page = pdfDoc.addPage([A4_W, A4_H]);
  drawVectorHeaderAndFooter(
    page,
    isAmharic
      ? 'ኣስኳላ Tutors — የብሔራዊ መታወቂያ ማረጋገጫ'
      : 'ኣስኳላ Tutors — National ID Verification (Front & Back)',
    isAmharic
      ? `አመልካች፡ ${applicantName || 'ወላጅ'}  ·  የተረጋገጡ ሁለቱም የመታወቂያ ገጾች`
      : `Applicant: ${applicantName || 'Applicant'}  ·  Front & Back Identity Photos`,
    pageNumber,
    fonts
  );

  const boxW = A4_W - PAGE_MARGIN * 2;
  const boxH = 310;

  const drawSideCard = async (
    bytes: Uint8Array | null,
    doc: UploadedImageDoc | undefined,
    topY: number,
    title: string
  ) => {
    const bottomY = topY - boxH;
    // Outer card box
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: bottomY,
      width: boxW,
      height: boxH,
      color: rgb(0.94, 0.99, 0.96),
      borderColor: rgb(0.078, 0.325, 0.176),
      borderWidth: 1.5,
    });

    // Sub-header bar
    const subH = 26;
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: topY - subH,
      width: boxW,
      height: subH,
      color: rgb(0.078, 0.325, 0.176),
    });
    drawVectorText(page, title, PAGE_MARGIN + 12, topY - 17, 10.5, true, fonts, rgb(1, 1, 1));

    if (!bytes) {
      drawVectorText(
        page,
        isAmharic ? 'ፎቶ አልተገኘም።' : 'Image not attached.',
        PAGE_MARGIN + 16,
        bottomY + boxH / 2,
        10.5,
        true,
        fonts,
        rgb(0.86, 0.15, 0.15)
      );
      return;
    }

    try {
      const embedded = await embedImageBytesIntoPdf(pdfDoc, bytes, doc?.mimeType);
      const pad = 12;
      const availW = boxW - pad * 2;
      const availH = boxH - subH - pad * 2;
      const scale = Math.min(availW / Math.max(1, embedded.width), availH / Math.max(1, embedded.height));
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;
      const drawX = PAGE_MARGIN + (boxW - drawW) / 2;
      const drawY = bottomY + (boxH - subH - drawH) / 2;
      page.drawRectangle({
        x: drawX - 2,
        y: drawY - 2,
        width: drawW + 4,
        height: drawH + 4,
        color: rgb(1, 1, 1),
      });
      page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
    } catch {
      drawVectorText(
        page,
        isAmharic ? 'የመታወቂያ ፎቶውን ማንበብ አልተቻለም።' : 'Unable to decode National ID image.',
        PAGE_MARGIN + 16,
        bottomY + boxH / 2,
        10.5,
        true,
        fonts,
        rgb(0.86, 0.15, 0.15)
      );
    }
  };

  await drawSideCard(
    frontBytes,
    frontDoc,
    A4_H - 106,
    isAmharic ? '1. የብሔራዊ መታወቂያ — የፊት ገጽ (Front Side)' : '1. National ID — Front Side'
  );

  await drawSideCard(
    backBytes,
    backDoc,
    A4_H - 106 - boxH - 22,
    isAmharic ? '2. የብሔራዊ መታወቂያ — የጀርባ ገጽ (Back Side)' : '2. National ID — Back Side'
  );

  return true;
}

function buildFallbackPageCard(
  captionPrefix: string,
  pageNum: number,
  total: number,
  note: string
): PreviewPageItem {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1260;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, canvas.width, 64);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(0, 60, canvas.width, 4);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px "Times New Roman", "Noto Sans Ethiopic", serif';
  ctx.fillText(`${captionPrefix}  ·  Page ${pageNum} of ${total}`, 28, 40);

  ctx.strokeStyle = '#bbf7d0';
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 110, canvas.width - 96, canvas.height - 160);

  ctx.fillStyle = '#14532d';
  ctx.font = 'bold 28px "Times New Roman", "Noto Sans Ethiopic", serif';
  ctx.fillText(`Document Page ${pageNum} of ${total}`, 84, 210);

  ctx.fillStyle = '#334155';
  ctx.font = '21px "Times New Roman", "Noto Sans Ethiopic", serif';
  ctx.fillText(note, 84, 270);

  return {
    url: canvas.toDataURL('image/png'),
    caption: `${captionPrefix} (Page ${pageNum} of ${total})`,
    kind: 'document',
  };
}

export async function renderPdfBytesToPngUrls(
  pdfBytes: Uint8Array,
  captionPrefix = 'PDF Document',
  fallbackPageCount = 1,
  pageMetaOverride?: Array<{ caption: string; kind: PreviewPageItem['kind'] }>
): Promise<PreviewPageItem[]> {
  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
  try {
    const dataCopy = new Uint8Array(pdfBytes);
    loadingTask = pdfjsLib.getDocument({
      data: dataCopy,
      useWorkerFetch: false,
    });
    const pdf = await loadingTask.promise;
    const total = Math.max(1, pdf.numPages);
    const items: PreviewPageItem[] = [];

    for (let pageNum = 1; pageNum <= total; pageNum += 1) {
      const override = pageMetaOverride?.[pageNum - 1];
      const caption = override?.caption || `${captionPrefix} (Page ${pageNum} of ${total})`;
      const kind = override?.kind || 'document';

      try {
        const page = await pdf.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        // Crisp 2x+ Retina-grade rasterization of real vector PDF for screen preview
        const targetScale = Math.min(2.6, Math.max(1.8, 1360 / Math.max(1, baseViewport.width)));
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          canvas,
          viewport,
        }).promise;

        items.push({
          url: canvas.toDataURL('image/png'),
          caption,
          kind,
        });
      } catch (pageErr) {
        console.warn(`PDF page ${pageNum} render fallback:`, pageErr);
        items.push(
          buildFallbackPageCard(
            captionPrefix,
            pageNum,
            total,
            'This page is embedded inside the downloadable unified vector PDF file.'
          )
        );
      }
    }

    return items;
  } catch (err) {
    console.warn('PDF.js document rendering fallback:', err);
    const count = Math.max(1, fallbackPageCount);
    return Array.from({ length: count }, (_, i) =>
      buildFallbackPageCard(
        captionPrefix,
        i + 1,
        count,
        'This PDF page is embedded directly inside your downloadable vector PDF file.'
      )
    );
  } finally {
    if (loadingTask) {
      await loadingTask.destroy().catch(() => {});
    }
  }
}

function lookupLabel(list: { id: string; en: string; am: string }[], id: string, lang: 'en' | 'am') {
  const found = list.find((item) => item.id === id);
  if (!found) return id;
  return lang === 'am' ? found.am : found.en;
}

export async function buildTutorUnifiedPdf(
  profile: TutorProfileData,
  academicRecords: TutorAcademicRecords,
  uploadedDocuments: UploadedPdfDoc[],
  nationalIdFront?: UploadedImageDoc,
  nationalIdBack?: UploadedImageDoc
): Promise<{
  pdfBytes: Uint8Array;
  totalPages: number;
  previewPageUrls: string[];
  previewPages: PreviewPageItem[];
}> {
  const modeMap: Record<string, string> = {
    online: 'Online Only',
    in_person: 'In-Person Only',
    both: 'Both Online & In-Person',
  };
  const expMap: Record<string, string> = {
    first_time: 'First Time Tutor',
    '1_year': '1 Year Experience',
    '2_plus_years': '2+ Years Experience',
  };
  const feeMap: Record<string, string> = {
    '400_600': '400 – 600 ETB / hour',
    '600_plus': '600+ ETB / hour',
    '400': '400 ETB / hour',
    '500': '500 ETB / hour',
    '600': '600 ETB / hour',
    '700_plus': '700 ETB and over / hour',
  };

  const lines: SheetLine[] = [
    { type: 'section', label: '1. Applicant Profile & Tutoring Preferences' },
    { type: 'row', label: 'Full Name', value: profile.fullName },
    { type: 'row', label: 'Ethiopian Phone No.', value: profile.phone },
    { type: 'row', label: 'Sex', value: profile.sex === 'male' ? 'Male' : 'Female' },
    {
      type: 'row',
      label: 'Education Level',
      value: EDUCATION_LEVEL_LABELS[profile.educationLevel] || profile.educationLevel,
    },
    { type: 'row', label: 'Tutoring Mode', value: modeMap[profile.tutoringMode] || '—' },
    { type: 'row', label: 'Prior Experience', value: expMap[profile.priorExperience] || '—' },
    {
      type: 'row',
      label: 'Expected Hourly Fee',
      value: feeMap[profile.expectedFeePerHour] || '—',
    },
    {
      type: 'row',
      label: 'Preferred Locations',
      value: profile.preferredLocations
        .map((id) => lookupLabel(ADDIS_LOCATIONS, id, 'en'))
        .join(', '),
    },
    {
      type: 'row',
      label: 'Preferred Subjects',
      value: profile.preferredSubjects.map((id) => lookupLabel(SUBJECTS, id, 'en')).join(', '),
    },
    {
      type: 'row',
      label: 'Days per Week',
      value: profile.daysPerWeek
        ? `${profile.daysPerWeek} day(s) per week`
        : `${profile.preferredDays.length} day(s) per week`,
    },
    {
      type: 'row',
      label: 'Preferred Days',
      value: profile.preferredDays.map((id) => lookupLabel(DAYS_OF_WEEK, id, 'en')).join(', '),
    },
    {
      type: 'row',
      label: 'Hours per Day',
      value: profile.hoursPerDay ? `${profile.hoursPerDay} hour(s) per day` : '—',
    },
    {
      type: 'row',
      label: 'Weekday Schedule',
      value:
        profile.weekdaySlots.length > 0
          ? profile.weekdaySlots.map((id) => lookupLabel(WEEKDAY_SLOTS, id, 'en')).join(', ')
          : 'None selected',
    },
    {
      type: 'row',
      label: 'Weekend Schedule',
      value:
        profile.weekendSlots.length > 0
          ? profile.weekendSlots.map((id) => lookupLabel(WEEKEND_SLOTS, id, 'en')).join(', ')
          : 'None selected',
    },
    { type: 'section', label: '2. Academic Records (Verified >= 87% | ESSLCE >= 450/600 or >= 525/700)' },
  ];

  if (academicRecords.grade9Avg)
    lines.push({ type: 'row', label: 'Grade 9 Average', value: `${academicRecords.grade9Avg}%` });
  if (academicRecords.grade10Avg)
    lines.push({ type: 'row', label: 'Grade 10 Average', value: `${academicRecords.grade10Avg}%` });
  if (academicRecords.grade11Avg)
    lines.push({ type: 'row', label: 'Grade 11 Average', value: `${academicRecords.grade11Avg}%` });
  if (academicRecords.grade12Avg)
    lines.push({ type: 'row', label: 'Grade 12 Average', value: `${academicRecords.grade12Avg}%` });
  const esslceRaw = academicRecords.esslceScore || academicRecords.esslceOutOf600;
  if (esslceRaw) {
    const scale = academicRecords.esslceScale === '700' ? '700' : '600';
    lines.push({
      type: 'row',
      label: `ESSLCE Score (/${scale})`,
      value: `${esslceRaw} / ${scale}`,
    });
  }
  if (academicRecords.graduationCgpa)
    lines.push({
      type: 'row',
      label: 'Graduation CGPA',
      value: academicRecords.graduationCgpa,
    });

  lines.push({ type: 'section', label: '3. National ID & Uploaded Academic PDFs' });
  lines.push({
    type: 'row',
    label: 'National ID (Front & Back)',
    value:
      nationalIdFront && nationalIdBack
        ? `Attached (${nationalIdFront.filename} & ${nationalIdBack.filename} — Page appended below)`
        : 'Pending National ID upload',
  });
  if (uploadedDocuments.length === 0) {
    lines.push({ type: 'note', label: 'No supporting PDF documents attached.' });
  } else {
    for (const doc of uploadedDocuments) {
      lines.push({
        type: 'row',
        label: doc.label,
        value: `${doc.filename} (${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''} — each page embedded visibly below)`,
      });
    }
  }

  const mergedPdf = await PDFDocument.create();
  const fonts = await embedVectorFonts(mergedPdf);

  const summaryPageCount = renderLinesToVectorPages(
    mergedPdf,
    'ኣስኳላ Tutors — Tutor Application Dossier',
    `Applicant: ${profile.fullName || 'Tutor'}  ·  Clean Vector Summary, National ID & Academic PDFs`,
    lines,
    fonts
  );

  const pageMetaOverride: Array<{ caption: string; kind: PreviewPageItem['kind'] }> = [];
  for (let i = 1; i <= summaryPageCount; i += 1) {
    pageMetaOverride.push({
      caption: `Application Summary (Page ${i} of ${summaryPageCount})`,
      kind: 'summary',
    });
  }

  const hasIdPage = await embedNationalIdVectorPage(
    mergedPdf,
    nationalIdFront,
    nationalIdBack,
    profile.fullName,
    summaryPageCount + 1,
    false,
    fonts
  );
  if (hasIdPage) {
    pageMetaOverride.push({
      caption: 'National ID Verification (Front & Back)',
      kind: 'national_id',
    });
  }

  // Embed every page of every uploaded PDF onto standardized labeled A4 vector pages
  for (const doc of uploadedDocuments) {
    const rawBytes = await getPdfBytes(doc.fileId);
    if (!rawBytes) continue;

    try {
      const uploadedPdf = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      const srcPages = uploadedPdf.getPages();
      const totalDocPages = srcPages.length;

      for (let i = 0; i < totalDocPages; i += 1) {
        const srcPage = srcPages[i];
        pageMetaOverride.push({
          caption: `${doc.label} (${doc.filename}) — Page ${i + 1} of ${totalDocPages}`,
          kind: 'document',
        });

        try {
          const embeddedPage = await mergedPdf.embedPage(srcPage);
          const outPage = mergedPdf.addPage([A4_W, A4_H]);

          const bannerH = 34;
          outPage.drawRectangle({
            x: 0,
            y: A4_H - bannerH,
            width: A4_W,
            height: bannerH,
            color: rgb(0.078, 0.325, 0.176),
          });
          outPage.drawRectangle({
            x: 0,
            y: A4_H - bannerH - 2,
            width: A4_W,
            height: 2,
            color: rgb(0.133, 0.773, 0.369),
          });
          drawVectorText(
            outPage,
            `Attached Document: ${doc.label} (${doc.filename})  |  Page ${i + 1} of ${totalDocPages}`,
            20,
            A4_H - 22,
            9.5,
            true,
            fonts,
            rgb(1, 1, 1)
          );

          const margin = 16;
          const availW = A4_W - margin * 2;
          const availH = A4_H - bannerH - margin * 2 - 4;
          const scale = Math.min(
            availW / Math.max(1, embeddedPage.width),
            availH / Math.max(1, embeddedPage.height)
          );
          const drawW = embeddedPage.width * scale;
          const drawH = embeddedPage.height * scale;
          const drawX = (A4_W - drawW) / 2;
          const drawY = margin + (availH - drawH) / 2;

          outPage.drawPage(embeddedPage, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH,
          });
        } catch {
          const [copied] = await mergedPdf.copyPages(uploadedPdf, [i]);
          mergedPdf.addPage(copied);
        }
      }
    } catch (pdfErr) {
      console.warn('Unable to embed raw uploaded PDF pages via embedPage/copyPages:', pdfErr);
    }
  }

  const pdfBytes = await mergedPdf.save();
  const previewPages = await renderPdfBytesToPngUrls(
    pdfBytes,
    'Tutor Application PDF',
    mergedPdf.getPageCount(),
    pageMetaOverride
  );

  return {
    pdfBytes,
    totalPages: mergedPdf.getPageCount(),
    previewPageUrls: previewPages.map((p) => p.url),
    previewPages,
  };
}

export async function buildParentAmharicPdf(
  app: Omit<ParentApplication, 'id' | 'userId' | 'status' | 'updatedAt'>
): Promise<{
  pdfBytes: Uint8Array;
  totalPages: number;
  previewPageUrls: string[];
  previewPages: PreviewPageItem[];
}> {
  const budgetAm: Record<string, string> = {
    '400_500': '400–500 ብር በሰዓት',
    max_600: 'ከ600 ብር ያልበለጠ',
    '600_700_efficiency': 'ጥራትን እመርጣለሁ — 600–700 ብር ችግር የለውም',
  };
  const sexAm: Record<string, string> = {
    male: 'ወንድ',
    female: 'ሴት',
    any: 'ምንም ችግር የለውም',
  };
  const modeAm: Record<string, string> = {
    online: 'በኦንላይን',
    in_person: 'በአካል (ቤት ድረስ)',
  };
  const statusAm: Record<string, string> = {
    basic: 'መሠረታዊ',
    medium: 'መካከለኛ',
    advanced: 'ከፍተኛ',
  };

  const lines: SheetLine[] = [
    { type: 'section', label: '1. የወላጅ መገለጫ እና ብሔራዊ መታወቂያ' },
    { type: 'row', label: 'ሙሉ ስም', value: app.parentProfile.fullName },
    { type: 'row', label: 'ስልክ ቁጥር', value: app.parentProfile.phone },
    {
      type: 'row',
      label: 'የመኖሪያ አካባቢ',
      value: lookupLabel(ADDIS_LOCATIONS, app.parentProfile.location, 'am'),
    },
    {
      type: 'row',
      label: 'በሰዓት የሚከፈል ክፍያ',
      value: budgetAm[app.parentProfile.expectedPaymentPerHour] || '—',
    },
    {
      type: 'row',
      label: 'ብሔራዊ መታወቂያ (የፊት እና የጀርባ)',
      value:
        app.nationalIdFront && app.nationalIdBack
          ? 'ሁለቱም የመታወቂያ ገጾች ተያይዘዋል (ቀጣይ ገጽ ላይ ይታያል)'
          : 'አልተያያዘም',
    },
    { type: 'section', label: `2. የልጆች መገለጫ (ጠቅላላ ልጆች፡ ${app.kids.length})` },
  ];

  app.kids.forEach((kid, idx) => {
    lines.push({ type: 'spacer' });
    lines.push({ type: 'note', label: `ልጅ ${idx + 1}` });
    lines.push({
      type: 'row',
      label: 'የትምህርት ደረጃ',
      value: lookupLabel(KID_GRADE_LEVELS, kid.gradeLevel, 'am'),
    });
    lines.push({
      type: 'row',
      label: 'በሳምንት የጥናት ቀናት ብዛት',
      value: `${kid.daysPerWeek || kid.selectedDays.length} ቀናት`,
    });
    lines.push({
      type: 'row',
      label: 'የጥናት ቀናት',
      value: kid.selectedDays.map((d) => lookupLabel(DAYS_OF_WEEK, d, 'am')).join('፣ '),
    });
    lines.push({
      type: 'row',
      label: 'በቀን የጥናት ሰዓት',
      value: kid.hoursPerDay ? `${kid.hoursPerDay} ሰዓት` : '—',
    });
    lines.push({
      type: 'row',
      label: 'የሳምንቱ ሰዓት (ኢትዮጵያዊ)',
      value:
        kid.weekdaySlots.length > 0
          ? kid.weekdaySlots.map((s) => lookupLabel(WEEKDAY_SLOTS, s, 'am')).join('፣ ')
          : 'አልተመረጠም',
    });
    lines.push({
      type: 'row',
      label: 'የቅዳሜ እና እሑድ ሰዓት',
      value:
        kid.weekendSlots.length > 0
          ? kid.weekendSlots.map((s) => lookupLabel(WEEKEND_SLOTS, s, 'am')).join('፣ ')
          : 'አልተመረጠም',
    });
    lines.push({
      type: 'row',
      label: 'የትምህርት ቤት ዓይነት',
      value:
        kid.schoolType === 'private'
          ? `የግል (${kid.privateCurriculum === 'international' ? 'ዓለም አቀፍ ሥርዓተ ትምህርት' : 'መደበኛ ሥርዓተ ትምህርት'})`
          : 'የመንግሥት',
    });
    lines.push({
      type: 'row',
      label: 'የሚፈለጉ ትምህርቶች',
      value: kid.preferredSubjects.map((s) => lookupLabel(SUBJECTS, s, 'am')).join('፣ '),
    });
    lines.push({
      type: 'row',
      label: 'የልጁ የትምህርት ሁኔታ',
      value: statusAm[kid.subjectStatus] || '—',
    });
  });

  lines.push({ type: 'section', label: '3. የመምህር ምርጫ' });
  lines.push({
    type: 'row',
    label: 'የመምህር ጾታ',
    value: sexAm[app.tutorPreference.sex] || '—',
  });
  lines.push({
    type: 'row',
    label: 'የማስተማሪያ ዘዴ',
    value: modeAm[app.tutorPreference.mode] || '—',
  });

  const pdfDoc = await PDFDocument.create();
  const fonts = await embedVectorFonts(pdfDoc);

  const summaryPageCount = renderLinesToVectorPages(
    pdfDoc,
    'ኣስኳላ Tutors — የወላጅ ማመልከቻ ማጠቃለያ',
    `ወላጅ፡ ${app.parentProfile.fullName || ''}  ·  የተመዘገበ የቤተሰብ መረጃ እና ብሔራዊ መታወቂያ`,
    lines,
    fonts
  );

  const pageMetaOverride: Array<{ caption: string; kind: PreviewPageItem['kind'] }> = [];
  for (let i = 1; i <= summaryPageCount; i += 1) {
    pageMetaOverride.push({
      caption: `የወላጅ ማመልከቻ ማጠቃለያ (ገጽ ${i} / ${summaryPageCount})`,
      kind: 'summary',
    });
  }

  const hasIdPage = await embedNationalIdVectorPage(
    pdfDoc,
    app.nationalIdFront,
    app.nationalIdBack,
    app.parentProfile.fullName,
    summaryPageCount + 1,
    true,
    fonts
  );
  if (hasIdPage) {
    pageMetaOverride.push({
      caption: 'የብሔራዊ መታወቂያ ማረጋገጫ (የፊት እና የጀርባ ገጽ)',
      kind: 'national_id',
    });
  }

  const pdfBytes = await pdfDoc.save();
  const previewPages = await renderPdfBytesToPngUrls(
    pdfBytes,
    'የወላጅ ማመልከቻ PDF',
    pdfDoc.getPageCount(),
    pageMetaOverride
  );

  return {
    pdfBytes,
    totalPages: pdfDoc.getPageCount(),
    previewPageUrls: previewPages.map((p) => p.url),
    previewPages,
  };
}
