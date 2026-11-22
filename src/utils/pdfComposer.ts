import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
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

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 76;
const A4_W = 595.28;
const A4_H = 841.89;

export interface PreviewPageItem {
  url: string;
  caption: string;
  kind: 'summary' | 'national_id' | 'document';
}

function toAsciiSafe(input: string): string {
  return (input || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackPageCard(
  captionPrefix: string,
  pageNum: number,
  total: number,
  note: string
): PreviewPageItem {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = Math.round(PAGE_H * 0.72);
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
  ctx.fillText(`Embedded PDF Page ${pageNum} of ${total}`, 84, 210);

  ctx.fillStyle = '#334155';
  ctx.font = '21px "Times New Roman", "Noto Sans Ethiopic", serif';
  const lines = wrapText(ctx, note, canvas.width - 168);
  let y = 270;
  for (const line of lines) {
    ctx.fillText(line, 84, y);
    y += 34;
  }

  return {
    url: canvas.toDataURL('image/png'),
    caption: `${captionPrefix} (Page ${pageNum} of ${total})`,
    kind: 'document',
  };
}

export async function renderPdfBytesToPngUrls(
  pdfBytes: Uint8Array,
  captionPrefix = 'PDF Document',
  fallbackPageCount = 1
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
      try {
        const page = await pdf.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetScale = Math.min(2.1, Math.max(1.25, 1180 / Math.max(1, baseViewport.width)));
        const viewport = page.getViewport({ scale: targetScale });

        const headerH = 56;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height + headerH);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Common-App style visible top strip for every embedded page
        ctx.fillStyle = '#14532d';
        ctx.fillRect(0, 0, canvas.width, headerH);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, headerH - 4, canvas.width, 4);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Times New Roman", "Noto Sans Ethiopic", serif';
        ctx.fillText(`${captionPrefix}  ·  Page ${pageNum} of ${total}`, 24, 35);

        ctx.save();
        ctx.translate(0, headerH);
        await page.render({
          canvasContext: ctx,
          canvas,
          viewport,
        }).promise;
        ctx.restore();

        items.push({
          url: canvas.toDataURL('image/png'),
          caption: `${captionPrefix} (Page ${pageNum} of ${total})`,
          kind: 'document',
        });
      } catch (pageErr) {
        console.warn(`PDF page ${pageNum} render fallback:`, pageErr);
        items.push(
          buildFallbackPageCard(
            captionPrefix,
            pageNum,
            total,
            'This page is embedded inside the downloadable unified PDF file. Click Download Full PDF or Full Screen PDF to inspect if your browser blocked inline rendering.'
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
        'This uploaded PDF page is embedded directly inside your unified downloadable PDF file.'
      )
    );
  } finally {
    if (loadingTask) {
      await loadingTask.destroy().catch(() => {});
    }
  }
}

async function decodeBytesToImage(
  bytes: Uint8Array,
  mimeType = 'image/jpeg'
): Promise<HTMLImageElement> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to decode National ID image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function buildNationalIdCanvasPage(
  frontDoc: UploadedImageDoc | undefined,
  backDoc: UploadedImageDoc | undefined,
  applicantName: string,
  isAmharic: boolean
): Promise<string | null> {
  if (!frontDoc && !backDoc) return null;

  const frontBytes = frontDoc ? await getImageBytes(frontDoc.fileId) : null;
  const backBytes = backDoc ? await getImageBytes(backDoc.fileId) : null;
  if (!frontBytes && !backBytes) return null;

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Header
  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, PAGE_W, 168);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(0, 164, PAGE_W, 6);

  const fontFamily = isAmharic
    ? '"Noto Sans Ethiopic", "Times New Roman", sans-serif'
    : '"Times New Roman", "Noto Sans Ethiopic", serif';

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 32px ${fontFamily}`;
  ctx.fillText(
    isAmharic
      ? 'ኣስኳላ Tutors — የብሔራዊ መታወቂያ ማረጋገጫ (የፊት እና የጀርባ ገጽ)'
      : 'ኣስኳላ Tutors — National ID Verification (Front & Back)',
    MARGIN,
    78
  );

  ctx.fillStyle = '#dcfce7';
  ctx.font = `20px ${fontFamily}`;
  ctx.fillText(
    isAmharic
      ? `አመልካች፡ ${applicantName || 'ወላጅ'}  ·  የተረጋገጡ ሁለቱም የመታወቂያ ገጾች`
      : `Applicant: ${applicantName || 'Applicant'}  ·  Front & Back Identity Photos`,
    MARGIN,
    122
  );

  const drawSideBox = async (
    bytes: Uint8Array | null,
    doc: UploadedImageDoc | undefined,
    boxY: number,
    boxH: number,
    title: string
  ) => {
    const boxX = MARGIN;
    const boxW = PAGE_W - MARGIN * 2;

    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Sub-banner
    ctx.fillStyle = '#14532d';
    ctx.fillRect(boxX, boxY, boxW, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 21px ${fontFamily}`;
    ctx.fillText(title, boxX + 20, boxY + 34);

    if (!bytes) {
      ctx.fillStyle = '#dc2626';
      ctx.font = `bold 20px ${fontFamily}`;
      ctx.fillText(
        isAmharic ? 'ፎቶ አልተገኘም።' : 'Image could not be loaded.',
        boxX + 24,
        boxY + boxH / 2
      );
      return;
    }

    try {
      const img = await decodeBytesToImage(bytes, doc?.mimeType || 'image/jpeg');
      const pad = 26;
      const availW = boxW - pad * 2;
      const availH = boxH - 52 - pad * 2;
      const scale = Math.min(availW / Math.max(1, img.width), availH / Math.max(1, img.height));
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + 52 + (boxH - 52 - drawH) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(drawX - 4, drawY - 4, drawW + 8, drawH + 8);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } catch {
      ctx.fillStyle = '#dc2626';
      ctx.font = `bold 20px ${fontFamily}`;
      ctx.fillText(
        isAmharic ? 'የመታወቂያ ፎቶውን ማንበብ አልተቻለም።' : 'Unable to decode National ID image.',
        boxX + 24,
        boxY + boxH / 2
      );
    }
  };

  await drawSideBox(
    frontBytes,
    frontDoc,
    210,
    670,
    isAmharic ? '1. የብሔራዊ መታወቂያ — የፊት ገጽ (Front Side)' : '1. National ID — Front Side'
  );

  await drawSideBox(
    backBytes,
    backDoc,
    920,
    670,
    isAmharic ? '2. የብሔራዊ መታወቂያ — የጀርባ ገጽ (Back Side)' : '2. National ID — Back Side'
  );

  ctx.fillStyle = '#475569';
  ctx.font = '18px "Times New Roman", "Noto Sans Ethiopic", serif';
  ctx.fillText(
    `ኣስኳላ Tutors  ·  National ID Verification Page  ·  ${new Date().toLocaleDateString()}`,
    MARGIN,
    PAGE_H - 48
  );

  return canvas.toDataURL('image/png');
}

interface SheetLine {
  type: 'section' | 'row' | 'note' | 'spacer';
  label?: string;
  value?: string;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function renderLinesToPages(
  headerTitle: string,
  headerSubtitle: string,
  lines: SheetLine[],
  isAmharic: boolean
): string[] {
  const pages: string[] = [];
  let pageIndex = 1;

  const createCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, PAGE_W, 168);

    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, 164, PAGE_W, 6);

    ctx.fillStyle = '#ffffff';
    ctx.font = isAmharic
      ? 'bold 34px "Noto Sans Ethiopic", "Times New Roman", serif'
      : 'bold 34px "Times New Roman", "Noto Sans Ethiopic", serif';
    ctx.fillText(headerTitle, MARGIN, 78);

    ctx.fillStyle = '#dcfce7';
    ctx.font = isAmharic
      ? '21px "Noto Sans Ethiopic", "Times New Roman", serif'
      : '21px "Times New Roman", "Noto Sans Ethiopic", serif';
    ctx.fillText(headerSubtitle, MARGIN, 122);

    return { canvas, ctx };
  };

  let { canvas, ctx } = createCanvas();
  let y = 230;
  const maxContentY = PAGE_H - 110;

  const finishPage = () => {
    ctx.fillStyle = '#475569';
    ctx.font = '18px "Times New Roman", "Noto Sans Ethiopic", serif';
    ctx.fillText(
      `ኣስኳላ Tutors  ·  Page ${pageIndex}  ·  Generated ${new Date().toLocaleDateString()}`,
      MARGIN,
      PAGE_H - 48
    );
    pages.push(canvas.toDataURL('image/png'));
    pageIndex += 1;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > maxContentY) {
      finishPage();
      const next = createCanvas();
      canvas = next.canvas;
      ctx = next.ctx;
      y = 230;
    }
  };

  const baseFont = isAmharic
    ? '"Noto Sans Ethiopic", "Times New Roman", sans-serif'
    : '"Times New Roman", "Noto Sans Ethiopic", serif';

  for (const item of lines) {
    if (item.type === 'spacer') {
      y += 18;
      continue;
    }

    if (item.type === 'section') {
      ensureSpace(64);
      y += 14;
      ctx.fillStyle = '#14532d';
      ctx.font = `bold 25px ${baseFont}`;
      ctx.fillText(item.label || '', MARGIN, y);
      y += 12;
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(MARGIN, y, PAGE_W - MARGIN * 2, 2);
      y += 30;
      continue;
    }

    if (item.type === 'note') {
      ctx.font = `20px ${baseFont}`;
      const wrapped = wrapText(ctx, item.label || '', PAGE_W - MARGIN * 2);
      ensureSpace(wrapped.length * 30 + 14);
      ctx.fillStyle = '#15803d';
      for (const w of wrapped) {
        ctx.fillText(w, MARGIN, y);
        y += 30;
      }
      y += 6;
      continue;
    }

    if (item.type === 'row') {
      const labelWidth = 340;
      const valMaxW = PAGE_W - MARGIN * 2 - labelWidth - 20;
      ctx.font = `21px ${baseFont}`;
      const wrappedVal = wrapText(ctx, item.value || '—', valMaxW);
      const rowHeight = Math.max(34, wrappedVal.length * 30 + 12);
      ensureSpace(rowHeight);

      ctx.fillStyle = '#14532d';
      ctx.font = `bold 20px ${baseFont}`;
      ctx.fillText(item.label || '', MARGIN, y);

      ctx.fillStyle = '#0f172a';
      ctx.font = `21px ${baseFont}`;
      let vy = y;
      for (const line of wrappedVal) {
        ctx.fillText(line, MARGIN + labelWidth + 20, vy);
        vy += 30;
      }

      y += rowHeight;
      ctx.fillStyle = '#dcfce7';
      ctx.fillRect(MARGIN, y - 10, PAGE_W - MARGIN * 2, 1);
    }
  }

  finishPage();
  return pages;
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
      label: 'Preferred Days',
      value: profile.preferredDays.map((id) => lookupLabel(DAYS_OF_WEEK, id, 'en')).join(', '),
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
    { type: 'section', label: '2. Academic Records (Verified ≥ 87% Threshold)' },
  ];

  if (academicRecords.grade9Avg)
    lines.push({ type: 'row', label: 'Grade 9 Average', value: `${academicRecords.grade9Avg}%` });
  if (academicRecords.grade10Avg)
    lines.push({ type: 'row', label: 'Grade 10 Average', value: `${academicRecords.grade10Avg}%` });
  if (academicRecords.grade11Avg)
    lines.push({ type: 'row', label: 'Grade 11 Average', value: `${academicRecords.grade11Avg}%` });
  if (academicRecords.grade12Avg)
    lines.push({ type: 'row', label: 'Grade 12 Average', value: `${academicRecords.grade12Avg}%` });
  if (academicRecords.esslceOutOf600)
    lines.push({
      type: 'row',
      label: 'ESSLCE Score (/600)',
      value: `${academicRecords.esslceOutOf600} / 600`,
    });
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
        value: `${doc.filename} (${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''} — each page appended visibly below)`,
      });
    }
  }

  const summaryImages = renderLinesToPages(
    'ኣስኳላ Tutors — Tutor Application Dossier',
    `Applicant: ${profile.fullName || 'Tutor'}  ·  Summary, National ID & Academic PDFs`,
    lines,
    false
  );

  const mergedPdf = await PDFDocument.create();
  const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

  for (const dataUrl of summaryImages) {
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const pngImage = await mergedPdf.embedPng(imgBytes);
    const page = mergedPdf.addPage([A4_W, A4_H]);
    page.drawImage(pngImage, { x: 0, y: 0, width: A4_W, height: A4_H });
  }

  const previewPages: PreviewPageItem[] = summaryImages.map((url, idx) => ({
    url,
    caption: `Application Summary (Page ${idx + 1} of ${summaryImages.length})`,
    kind: 'summary',
  }));

  // Embed National ID Front & Back verification page into PDF and preview list
  const nationalIdDataUrl = await buildNationalIdCanvasPage(
    nationalIdFront,
    nationalIdBack,
    profile.fullName,
    false
  );
  if (nationalIdDataUrl) {
    const idImgBytes = await fetch(nationalIdDataUrl).then((r) => r.arrayBuffer());
    const idPng = await mergedPdf.embedPng(idImgBytes);
    const idPage = mergedPdf.addPage([A4_W, A4_H]);
    idPage.drawImage(idPng, { x: 0, y: 0, width: A4_W, height: A4_H });
    previewPages.push({
      url: nationalIdDataUrl,
      caption: 'National ID Verification (Front & Back)',
      kind: 'national_id',
    });
  }

  // Common-App style: render every page of every uploaded PDF to visible preview images
  // AND embed each page onto a labeled standardized A4 page inside mergedPdf.
  for (const doc of uploadedDocuments) {
    const rawBytes = await getPdfBytes(doc.fileId);
    if (!rawBytes) continue;

    const renderedDocPages = await renderPdfBytesToPngUrls(
      rawBytes,
      `${doc.label} (${doc.filename})`,
      doc.pageCount || 1
    );
    previewPages.push(...renderedDocPages);

    try {
      const uploadedPdf = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      const srcPages = uploadedPdf.getPages();
      const totalDocPages = srcPages.length;
      const safeHeader = toAsciiSafe(`Attached Document: ${doc.label} (${doc.filename})`);

      for (let i = 0; i < totalDocPages; i += 1) {
        const srcPage = srcPages[i];
        try {
          const embeddedPage = await mergedPdf.embedPage(srcPage);
          const outPage = mergedPdf.addPage([A4_W, A4_H]);

          // Green Common-App style banner header on every page
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
          outPage.drawText(
            `${safeHeader.slice(0, 68)}  |  Page ${i + 1} of ${totalDocPages}`,
            {
              x: 20,
              y: A4_H - 22,
              size: 10,
              font: helveticaBold,
              color: rgb(1, 1, 1),
            }
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
          // Fallback to raw copyPages if embedPage fails for a specific page
          const [copied] = await mergedPdf.copyPages(uploadedPdf, [i]);
          mergedPdf.addPage(copied);
        }
      }
    } catch (pdfErr) {
      console.warn('Unable to embed raw uploaded PDF pages via embedPage/copyPages:', pdfErr);
    }
  }

  const pdfBytes = await mergedPdf.save();
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

  const summaryImages = renderLinesToPages(
    'ኣስኳላ Tutors — የወላጅ ማመልከቻ ማጠቃለያ',
    `ወላጅ፡ ${app.parentProfile.fullName || ''}  ·  የተመዘገበ የቤተሰብ መረጃ እና መታወቂያ`,
    lines,
    true
  );

  const pdfDoc = await PDFDocument.create();
  for (const dataUrl of summaryImages) {
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(imgBytes);
    const page = pdfDoc.addPage([A4_W, A4_H]);
    page.drawImage(pngImage, { x: 0, y: 0, width: A4_W, height: A4_H });
  }

  const previewPages: PreviewPageItem[] = summaryImages.map((url, idx) => ({
    url,
    caption: `የወላጅ ማመልከቻ ማጠቃለያ (ገጽ ${idx + 1} / ${summaryImages.length})`,
    kind: 'summary',
  }));

  const nationalIdDataUrl = await buildNationalIdCanvasPage(
    app.nationalIdFront,
    app.nationalIdBack,
    app.parentProfile.fullName,
    true
  );
  if (nationalIdDataUrl) {
    const idImgBytes = await fetch(nationalIdDataUrl).then((r) => r.arrayBuffer());
    const idPng = await pdfDoc.embedPng(idImgBytes);
    const idPage = pdfDoc.addPage([A4_W, A4_H]);
    idPage.drawImage(idPng, { x: 0, y: 0, width: A4_W, height: A4_H });
    previewPages.push({
      url: nationalIdDataUrl,
      caption: 'የብሔራዊ መታወቂያ ማረጋገጫ (የፊት እና የጀርባ ገጽ)',
      kind: 'national_id',
    });
  }

  const pdfBytes = await pdfDoc.save();
  return {
    pdfBytes,
    totalPages: pdfDoc.getPageCount(),
    previewPageUrls: previewPages.map((p) => p.url),
    previewPages,
  };
}
