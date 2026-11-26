import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFArray, PDFString, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

const A4_W = 595.28;
const A4_H = 841.89;

const WEBSITE_URL = 'https://ais-pre-ln2yrjxsdyocgqzxdstgbf-673426112697.europe-west2.run.app';
const PHONE_1 = '0908998412';
const PHONE_2 = '099036733';

const ETHIOPIC_RUN_RE = /([\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]+)/g;
const ETHIOPIC_TEST_RE = /^[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]+$/;

function splitRuns(text, isBold, fonts) {
  const parts = String(text || '')
    .split(ETHIOPIC_RUN_RE)
    .filter((p) => p.length > 0);
  return parts.map((segment) => ({
    segment,
    font: ETHIOPIC_TEST_RE.test(segment)
      ? isBold
        ? fonts.ethBold
        : fonts.ethReg
      : isBold
        ? fonts.latinBold
        : fonts.latinReg,
  }));
}

function measureMixedWidth(text, size, isBold, fonts) {
  const runs = splitRuns(text, isBold, fonts);
  return runs.reduce((acc, r) => acc + r.font.widthOfTextAtSize(r.segment, size), 0);
}

function drawMixedText(page, text, opts) {
  const { x, y, size, color, isBold = false, fonts, rotateDeg = 0 } = opts;
  const runs = splitRuns(text, isBold, fonts);
  let cursorX = x;
  let cursorY = y;
  const rad = (rotateDeg * Math.PI) / 180;
  for (const run of runs) {
    page.drawText(run.segment, {
      x: cursorX,
      y: cursorY,
      size,
      font: run.font,
      color,
      rotate: rotateDeg ? degrees(rotateDeg) : undefined,
    });
    const w = run.font.widthOfTextAtSize(run.segment, size);
    cursorX += w * Math.cos(rad);
    cursorY += w * Math.sin(rad);
  }
  return cursorX;
}

function drawMixedCentered(page, text, opts) {
  const { centerX, y, size, color, isBold = false, fonts, rotateDeg = 0 } = opts;
  const totalW = measureMixedWidth(text, size, isBold, fonts);
  const rad = (rotateDeg * Math.PI) / 180;
  const startX = centerX - (totalW / 2) * Math.cos(rad);
  const startY = y - (totalW / 2) * Math.sin(rad);
  drawMixedText(page, text, { x: startX, y: startY, size, color, isBold, fonts, rotateDeg });
}

function wrapMixedLines(text, maxWidth, size, isBold, fonts) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureMixedWidth(candidate, size, isBold, fonts) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawMixedWrapped(page, text, opts) {
  const { x, y, maxWidth, size, lineHeight, color, isBold = false, fonts, align = 'left' } = opts;
  const lines = wrapMixedLines(text, maxWidth, size, isBold, fonts);
  let curY = y;
  for (const line of lines) {
    if (align === 'center') {
      drawMixedCentered(page, line, { centerX: x + maxWidth / 2, y: curY, size, color, isBold, fonts });
    } else {
      drawMixedText(page, line, { x, y: curY, size, color, isBold, fonts });
    }
    curY -= lineHeight;
  }
  return curY;
}

// SVG path for rounded rectangle starting at top-left (0,0) -> (w,h)
function roundedRectPath(w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${rr},0`,
    `L ${w - rr},0`,
    `Q ${w},0 ${w},${rr}`,
    `L ${w},${h - rr}`,
    `Q ${w},${h} ${w - rr},${h}`,
    `L ${rr},${h}`,
    `Q 0,${h} 0,${h - rr}`,
    `L 0,${rr}`,
    `Q 0,0 ${rr},0 Z`,
  ].join(' ');
}

// Asymmetric rounded card (e.g., top-right corner ribbon with curved bottom-left)
function customCornersPath(w, h, rTL, rTR, rBR, rBL) {
  return [
    `M ${rTL},0`,
    `L ${w - rTR},0`,
    `Q ${w},0 ${w},${rTR}`,
    `L ${w},${h - rBR}`,
    `Q ${w},${h} ${w - rBR},${h}`,
    `L ${rBL},${h}`,
    `Q 0,${h} 0,${h - rBL}`,
    `L 0,${rTL}`,
    `Q 0,0 ${rTL},0 Z`,
  ].join(' ');
}

function drawRoundedBox(page, opts) {
  const {
    x,
    y, // bottom-left Y in PDF coordinates
    width,
    height,
    radius = 12,
    color,
    borderColor,
    borderWidth = 0,
    opacity = 1,
    borderOpacity = 1,
  } = opts;
  page.drawSvgPath(roundedRectPath(width, height, radius), {
    x,
    y: y + height,
    color,
    borderColor,
    borderWidth,
    opacity,
    borderOpacity,
  });
}

// Custom modern vector crest logo inspired by the open book + rising scholar & gold star
function drawAskualaModernLogo(page, x, topY, scale = 1) {
  const navy = rgb(0.043, 0.122, 0.267); // #0B1F44
  const gold = rgb(0.961, 0.718, 0.0); // #F5B700
  const emerald = rgb(0.055, 0.486, 0.314); // #0E7C50

  // Soft circular glow backdrop
  page.drawCircle({
    x: x + 28 * scale,
    y: topY - 28 * scale,
    size: 27 * scale,
    color: rgb(0.996, 0.965, 0.855),
    borderColor: gold,
    borderWidth: 1.4 * scale,
  });

  // Left & Right Navy Book Pages (open curved wings)
  page.drawSvgPath(
    'M 8,36 C 14,32 22,33 27.5,39 L 27.5,45 C 21,40 13,40 7,43 Z',
    { x, y: topY, scale, color: navy }
  );
  page.drawSvgPath(
    'M 48,36 C 42,32 34,33 28.5,39 L 28.5,45 C 35,40 43,40 49,43 Z',
    { x, y: topY, scale, color: navy }
  );

  // Inner Golden Book Pages Accent
  page.drawSvgPath(
    'M 10,32 C 16,29 22,30 27.5,35.5 L 27.5,38 C 22,33.5 15,32.5 9.5,35 Z',
    { x, y: topY, scale, color: gold }
  );
  page.drawSvgPath(
    'M 46,32 C 40,29 34,30 28.5,35.5 L 28.5,38 C 34,33.5 41,32.5 46.5,35 Z',
    { x, y: topY, scale, color: gold }
  );

  // Joyful scholar silhouette rising from center book with uplifted arms
  page.drawSvgPath(
    'M 19,20 C 22,25 25,28 28,33 C 31,27 35,21 40,14 C 37,20 33,27 30.5,35 L 25.5,35 C 23,28 20.5,24 19,20 Z',
    { x, y: topY, scale, color: navy }
  );
  // Scholar head
  page.drawCircle({
    x: x + 28 * scale,
    y: topY - 21 * scale,
    size: 4.1 * scale,
    color: emerald,
  });

  // Bright 5-point Golden Star above uplifted reach
  page.drawSvgPath(
    'M 40.5,5.5 L 42.1,9.7 L 46.6,9.9 L 43.1,12.7 L 44.3,17 L 40.5,14.5 L 36.7,17 L 37.9,12.7 L 34.4,9.9 L 38.9,9.7 Z',
    { x, y: topY, scale, color: gold }
  );
}

// Handshake/Trust emblem inside bottom-left circular seal
function drawTrustSealBadge(page, cx, cy) {
  const navy = rgb(0.043, 0.122, 0.267);
  const gold = rgb(0.961, 0.718, 0.0);
  const emerald = rgb(0.055, 0.486, 0.314);
  const white = rgb(1, 1, 1);

  page.drawCircle({
    x: cx,
    y: cy,
    size: 23,
    color: navy,
    borderColor: gold,
    borderWidth: 2.5,
  });
  page.drawCircle({
    x: cx,
    y: cy,
    size: 18,
    borderColor: rgb(0.996, 0.94, 0.72),
    borderWidth: 0.7,
    borderOpacity: 0.65,
  });
  // Stylized open book + star centered inside circular seal
  page.drawSvgPath(
    'M 6,21 C 10.5,17.5 15,18.5 18,22.5 L 18,26.5 C 14,23 10,23 5.5,25.5 Z',
    { x: cx - 18, y: cy + 16, color: white }
  );
  page.drawSvgPath(
    'M 30,21 C 25.5,17.5 21,18.5 18,22.5 L 18,26.5 C 22,23 26,23 30.5,25.5 Z',
    { x: cx - 18, y: cy + 16, color: gold }
  );
  page.drawSvgPath(
    'M 18,5.5 L 19.8,10.2 L 24.8,10.5 L 20.9,13.6 L 22.2,18.4 L 18,15.6 L 13.8,18.4 L 15.1,13.6 L 11.2,10.5 L 16.2,10.2 Z',
    { x: cx - 18, y: cy + 16, color: emerald }
  );
}

function addUriLinkAnnotation(pdfDoc, page, rect, uri) {
  const [x1, y1, x2, y2] = rect;
  const linkAnnot = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x1, y1, x2, y2],
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(uri),
    },
  });
  const linkRef = pdfDoc.context.register(linkAnnot);
  const existing = page.node.get(PDFName.of('Annots'));
  if (existing instanceof PDFArray) {
    existing.push(linkRef);
  } else {
    page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));
  }
}

function drawQrCodeVector(page, url, x, y, boxSize, darkColor, lightColor, goldBorder) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const count = modules.size;
  const pad = 7;
  const innerSize = boxSize - pad * 2;
  const cell = innerSize / count;

  drawRoundedBox(page, {
    x,
    y,
    width: boxSize,
    height: boxSize,
    radius: 10,
    color: lightColor,
    borderColor: goldBorder,
    borderWidth: 2,
  });

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (modules.get(r, c)) {
        page.drawRectangle({
          x: x + pad + c * cell,
          y: y + boxSize - pad - (r + 1) * cell,
          width: cell + 0.08,
          height: cell + 0.08,
          color: darkColor,
        });
      }
    }
  }
}

async function generateFlyer() {
  const rootDir = process.cwd();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('ኣስኳላ አስጠኚዎች — የቤተሰቦች የጥናት አገልግሎት ማስታወቂያ');
  pdfDoc.setSubject('Askuala Astegniwoch Families Flyer (Amharic)');
  pdfDoc.setCreator('ኣስኳላ አስጠኚዎች');
  pdfDoc.registerFontkit(fontkit);

  const ethRegBytes = fs.readFileSync(path.join(rootDir, 'src/assets/fonts/NotoSansEthiopic-Regular.ttf'));
  const ethBoldBytes = fs.readFileSync(path.join(rootDir, 'src/assets/fonts/NotoSansEthiopic-Bold.ttf'));
  const latinRegBytes = fs.readFileSync('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf');
  const latinBoldBytes = fs.readFileSync('/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf');

  const [ethReg, ethBold, latinReg, latinBold] = await Promise.all([
    pdfDoc.embedFont(ethRegBytes),
    pdfDoc.embedFont(ethBoldBytes),
    pdfDoc.embedFont(latinRegBytes),
    pdfDoc.embedFont(latinBoldBytes),
  ]);
  const fonts = { ethReg, ethBold, latinReg, latinBold };

  const heroBytes = fs.readFileSync(
    path.join(rootDir, 'src/assets/images/askuala_flyer_green_shirt_clean_1795699091652.jpg')
  );
  const heroImg = await pdfDoc.embedJpg(heroBytes);

  const page = pdfDoc.addPage([A4_W, A4_H]);

  // Vibrant Modern Graphic Palette (inspired by the Navy + Bright Gold + Cream + Emerald + White reference)
  const white = rgb(1, 1, 1);
  const softSkyBg = rgb(0.969, 0.98, 0.996); // #F7FAFE crisp bright white-blue tint
  const navy = rgb(0.043, 0.122, 0.267); // #0B1F44
  const navyDeep = rgb(0.027, 0.086, 0.2); // #071633
  const gold = rgb(0.961, 0.718, 0.0); // #F5B700 vibrant golden yellow
  const goldCream = rgb(0.996, 0.945, 0.745); // #FEF1BE warm soft butter gold
  const emerald = rgb(0.055, 0.486, 0.314); // #0E7C50 vibrant emerald green
  const emeraldLight = rgb(0.922, 0.98, 0.949); // #EBFAF2
  const slateText = rgb(0.22, 0.275, 0.35); // #384659
  const cardBorder = rgb(0.86, 0.9, 0.95);
  const shadowColor = rgb(0.82, 0.87, 0.93);

  // 1. Clean Bright Canvas + Subtle Geometric Accents
  page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: softSkyBg });

  // Soft decorative curved light-gold accent wave top-left
  page.drawCircle({
    x: 40,
    y: A4_H - 10,
    size: 135,
    color: rgb(0.996, 0.976, 0.91),
    opacity: 0.7,
  });
  // Soft emerald tint accent circle behind middle-right
  page.drawCircle({
    x: A4_W - 25,
    y: 445,
    size: 110,
    color: rgb(0.915, 0.975, 0.945),
    opacity: 0.65,
  });

  // Top & Bottom Sleek Color Trim Bars
  page.drawRectangle({ x: 0, y: A4_H - 7, width: A4_W, height: 7, color: navy });
  page.drawRectangle({ x: 0, y: A4_H - 10, width: A4_W, height: 3, color: gold });
  page.drawRectangle({ x: 0, y: 0, width: A4_W, height: 6, color: gold });

  // Decorative subtle gold dots matrix near left margin
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      page.drawCircle({
        x: 24 + col * 8,
        y: 492 - row * 8,
        size: 1.3,
        color: gold,
        opacity: 0.55,
      });
    }
  }

  // =========================================================================
  // 2. TOP HERO SPLIT LAYOUT (Resembling reference aesthetic — elevated!)
  // =========================================================================

  // --- LEFT HERO COLUMN (Logo, Navy+Gold Featured Box, Soft-Gold Tagline Pill, Lead Copy) ---
  const leftColX = 24;
  const leftColW = 244;

  // Brand Lockup: Modern Open-Book+Star Vector Logo + Stacked Bold Amharic Title
  drawAskualaModernLogo(page, leftColX, A4_H - 22, 1.04);
  drawMixedText(page, 'ኣስኳላ', {
    x: leftColX + 66,
    y: A4_H - 47,
    size: 21.5,
    color: navy,
    isBold: true,
    fonts,
  });
  drawMixedText(page, 'አስጠኚዎች', {
    x: leftColX + 66,
    y: A4_H - 70,
    size: 17.5,
    color: emerald,
    isBold: true,
    fonts,
  });

  // Location Mini Pill
  drawRoundedBox(page, {
    x: leftColX + 66,
    y: A4_H - 91,
    width: 116,
    height: 16,
    radius: 8,
    color: emeraldLight,
    borderColor: emerald,
    borderWidth: 0.7,
  });
  drawMixedCentered(page, 'አዲስ አበባ · ኢትዮጵያ', {
    centerX: leftColX + 66 + 58,
    y: A4_H - 86,
    size: 7.5,
    color: emerald,
    isBold: true,
    fonts,
  });

  // Signature Navy Rounded Box with Vibrant Golden Yellow Border (Main Headline!)
  const heroBoxY = 650;
  const heroBoxH = 74;
  // Soft shadow behind navy box
  drawRoundedBox(page, {
    x: leftColX + 3,
    y: heroBoxY - 4,
    width: leftColW,
    height: heroBoxH,
    radius: 14,
    color: shadowColor,
  });
  drawRoundedBox(page, {
    x: leftColX,
    y: heroBoxY,
    width: leftColW,
    height: heroBoxH,
    radius: 14,
    color: navy,
    borderColor: gold,
    borderWidth: 2.6,
  });
  drawMixedWrapped(page, 'ለልጆችዎ ብቁ፣ ታማኝ እና የተመረጡ አስጠኚዎችን ይፈልጋሉ?', {
    x: leftColX + 14,
    y: heroBoxY + heroBoxH - 28,
    maxWidth: leftColW - 28,
    size: 13.4,
    lineHeight: 19,
    color: white,
    isBold: true,
    fonts,
    align: 'center',
  });

  // Signature Warm Butter-Gold Rounded Pill Card (Tagline)
  const goldPillY = 592;
  const goldPillH = 44;
  drawRoundedBox(page, {
    x: leftColX,
    y: goldPillY,
    width: leftColW,
    height: goldPillH,
    radius: 11,
    color: goldCream,
    borderColor: gold,
    borderWidth: 1.1,
  });
  drawMixedWrapped(page, 'ጥራቱ የተረጋገጠ የቤት ለቤት እና የኦንላይን የጥናት አገልግሎት', {
    x: leftColX + 12,
    y: goldPillY + goldPillH - 16,
    maxWidth: leftColW - 24,
    size: 9.1,
    lineHeight: 13,
    color: navy,
    isBold: true,
    fonts,
    align: 'center',
  });

  // Clean Family Subcopy Card below Gold Pill
  const subCopy =
    'በኣስኳላ አስጠኚዎች ከመዋዕለ ሕፃናት (ኬጂ) እስከ 12ኛ ክፍል ድረስ ለልጆችዎ የትምህርት ውጤት መሻሻልና በራስ መተማመን መዳበር የሚያግዙ፣ በትምህርት ብቃታቸውና በመልካም ሥነ ምግባራቸው የተመረጡ አስጠኚዎችን በቀላሉ ያገኛሉ።';
  drawMixedWrapped(page, subCopy, {
    x: leftColX + 2,
    y: 575,
    maxWidth: leftColW - 4,
    size: 8.5,
    lineHeight: 12.6,
    color: slateText,
    isBold: false,
    fonts,
    align: 'left',
  });

  // --- RIGHT HERO COLUMN (Vibrant Showcase Frame + Smiling Tutor in Green T-Shirt & Boy) ---
  const rightColX = 282;
  const rightColW = A4_W - rightColX - 24; // 289.28
  const photoW = rightColW - 12; // 277.28
  const photoH = (photoW * 3) / 4; // exact 4:3 = 207.96
  const showcaseY = 496;
  const showcaseH = 314;

  // Offset Navy & Gold Showcase Backdrop Card
  drawRoundedBox(page, {
    x: rightColX + 4,
    y: showcaseY - 4,
    width: rightColW,
    height: showcaseH,
    radius: 16,
    color: shadowColor,
  });
  drawRoundedBox(page, {
    x: rightColX,
    y: showcaseY,
    width: rightColW,
    height: showcaseH,
    radius: 16,
    color: navy,
    borderColor: gold,
    borderWidth: 2.2,
  });

  // Top Header Strip inside Right Photo Showcase ("ለወላጆች እና ለቤተሰቦች")
  const topRibbonH = 34;
  drawMixedCentered(page, 'ለወላጆች እና ለቤተሰቦች የተዘጋጀ አገልግሎት', {
    centerX: rightColX + rightColW / 2,
    y: showcaseY + showcaseH - 22,
    size: 9.8,
    color: gold,
    isBold: true,
    fonts,
  });

  // Embedded 4:3 Photo (smiling 18+ tutor in green shirt + smiling boy)
  const imgX = rightColX + 6;
  const imgY = showcaseY + showcaseH - topRibbonH - photoH; // ~572
  page.drawImage(heroImg, {
    x: imgX,
    y: imgY,
    width: photoW,
    height: photoH,
  });
  page.drawRectangle({
    x: imgX,
    y: imgY,
    width: photoW,
    height: photoH,
    borderColor: gold,
    borderWidth: 1.2,
  });

  // Crisp Brand Name on her green t-shirt chest right below the circular gold crest
  drawMixedCentered(page, 'ኣስኳላ አስጠኚዎች', {
    centerX: imgX + photoW * 0.522,
    y: imgY + photoH * 0.382,
    size: 3.8,
    color: rgb(0.98, 0.86, 0.45),
    isBold: true,
    fonts,
    rotateDeg: -2.5,
  });

  // Top-right overlapping curved Navy+Gold badge on the photo corner (resembling reference top-right pill!)
  const cornerBadgeW = 134;
  const cornerBadgeH = 30;
  const cornerBadgeX = rightColX + rightColW - cornerBadgeW + 4;
  const cornerBadgeTopY = imgY + photoH + 8;
  page.drawSvgPath(customCornersPath(cornerBadgeW, cornerBadgeH, 0, 12, 0, 14), {
    x: cornerBadgeX,
    y: cornerBadgeTopY,
    color: navyDeep,
    borderColor: gold,
    borderWidth: 2,
  });
  drawMixedCentered(page, 'ብቁ እና ታማኝ አስጠኚዎች', {
    centerX: cornerBadgeX + cornerBadgeW / 2,
    y: cornerBadgeTopY - 19,
    size: 8.2,
    color: white,
    isBold: true,
    fonts,
  });

  // Bottom Emerald & White Caption Band inside Showcase Card
  const capAreaTopY = imgY - 4;
  drawRoundedBox(page, {
    x: rightColX + 8,
    y: showcaseY + 8,
    width: rightColW - 16,
    height: capAreaTopY - (showcaseY + 8),
    radius: 10,
    color: emerald,
    borderColor: gold,
    borderWidth: 1.1,
  });
  drawMixedWrapped(
    page,
    'በፍቅር፣ በትዕግሥት እና በጥልቅ እውቀት የልጆችዎን የትምህርት ጉዞ የሚደግፉ ብቁ አስጠኚዎች',
    {
      x: rightColX + 36,
      y: capAreaTopY - 18,
      maxWidth: rightColW - 48,
      size: 8.6,
      lineHeight: 12.2,
      color: white,
      isBold: true,
      fonts,
      align: 'center',
    }
  );

  // Overlapping Circular Gold-Rimmed Trust Seal on Bottom-Left of Photo Card (like reference!)
  drawTrustSealBadge(page, rightColX + 14, showcaseY + 34);

  // =========================================================================
  // 3. TWO-COLUMN INFORMATION CARDS (Modern Vibrant Rounded Cards)
  // =========================================================================
  const gridTop = 480;
  const gridBottom = 166;
  const gridH = gridTop - gridBottom; // 314pt
  const colGap = 14;
  const colW = (A4_W - 48 - colGap) / 2; // 266.64
  const leftCardX = 24;
  const rightCardX = leftCardX + colW + colGap;

  // --- LEFT CARD: Why Families Choose Us ---
  drawRoundedBox(page, {
    x: leftCardX + 3,
    y: gridBottom - 3,
    width: colW,
    height: gridH,
    radius: 14,
    color: shadowColor,
  });
  drawRoundedBox(page, {
    x: leftCardX,
    y: gridBottom,
    width: colW,
    height: gridH,
    radius: 14,
    color: white,
    borderColor: cardBorder,
    borderWidth: 1.1,
  });
  // Navy Rounded Header Strip on Left Card
  page.drawSvgPath(customCornersPath(colW, 34, 14, 14, 0, 0), {
    x: leftCardX,
    y: gridTop,
    color: navy,
  });
  page.drawRectangle({
    x: leftCardX,
    y: gridTop - 36,
    width: colW,
    height: 2.5,
    color: gold,
  });
  drawMixedText(page, 'ለምን ኣስኳላ አስጠኚዎችን ይመርጣሉ?', {
    x: leftCardX + 14,
    y: gridTop - 22,
    size: 10.6,
    color: white,
    isBold: true,
    fonts,
  });

  const whyItems = [
    {
      num: '1',
      title: 'የተረጋገጠ ብቃትና ማንነት',
      desc: 'ሁሉም አስጠኚዎች የትምህርት ማስረጃቸውና ብሔራዊ መታወቂያቸው ተጣርቶ የተመረጡ ናቸው።',
    },
    {
      num: '2',
      title: 'ከልጅዎ ፍላጎት ጋር የተጣጣመ',
      desc: 'እንደ ልጅዎ ክፍል፣ የትምህርት ዓይነት፣ የሳምንት ቀናትና ሰዓት ተስማሚ አስጠኚ እንመድባለን።',
    },
    {
      num: '3',
      title: 'በቤትዎ በአካል ወይም በኦንላይን',
      desc: 'በአዲስ አበባ በቤትዎ በአካል ወይም በዘመናዊ ኦንላይን ትምህርት በምርጫዎ ይሰጣል።',
    },
    {
      num: '4',
      title: 'ተከታታይ የውጤት ክትትል',
      desc: 'የቤት ሥራ እገዛ፣ የፈተና ዝግጅትና የልጅዎን የትምህርት እድገት በየጊዜው እንከታተላለን።',
    },
  ];

  let curLeftY = gridTop - 58;
  for (const item of whyItems) {
    // Vibrant Gold Rounded Number Badge
    drawRoundedBox(page, {
      x: leftCardX + 12,
      y: curLeftY - 12,
      width: 21,
      height: 21,
      radius: 6,
      color: goldCream,
      borderColor: gold,
      borderWidth: 1,
    });
    drawMixedCentered(page, item.num, {
      centerX: leftCardX + 22.5,
      y: curLeftY - 5.5,
      size: 9.4,
      color: navy,
      isBold: true,
      fonts,
    });

    drawMixedText(page, item.title, {
      x: leftCardX + 41,
      y: curLeftY - 2,
      size: 10,
      color: navy,
      isBold: true,
      fonts,
    });
    const afterDescY = drawMixedWrapped(page, item.desc, {
      x: leftCardX + 41,
      y: curLeftY - 17,
      maxWidth: colW - 54,
      size: 8.6,
      lineHeight: 12.6,
      color: slateText,
      isBold: false,
      fonts,
    });
    curLeftY = afterDescY - 18;
  }

  // --- RIGHT CARD: Subjects, Grade Levels & 3 Simple Steps ---
  drawRoundedBox(page, {
    x: rightCardX + 3,
    y: gridBottom - 3,
    width: colW,
    height: gridH,
    radius: 14,
    color: shadowColor,
  });
  drawRoundedBox(page, {
    x: rightCardX,
    y: gridBottom,
    width: colW,
    height: gridH,
    radius: 14,
    color: white,
    borderColor: cardBorder,
    borderWidth: 1.1,
  });
  // Emerald Rounded Header Strip on Right Card
  page.drawSvgPath(customCornersPath(colW, 34, 14, 14, 0, 0), {
    x: rightCardX,
    y: gridTop,
    color: emerald,
  });
  page.drawRectangle({
    x: rightCardX,
    y: gridTop - 36,
    width: colW,
    height: 2.5,
    color: gold,
  });
  drawMixedText(page, 'የሚሰጡ ትምህርቶችና የክፍል ደረጃዎች', {
    x: rightCardX + 14,
    y: gridTop - 22,
    size: 10.6,
    color: white,
    isBold: true,
    fonts,
  });

  // Soft Cream Highlight Box for Grade Range
  drawRoundedBox(page, {
    x: rightCardX + 12,
    y: gridTop - 80,
    width: colW - 24,
    height: 34,
    radius: 8,
    color: goldCream,
    borderColor: gold,
    borderWidth: 0.9,
  });
  drawMixedWrapped(
    page,
    'ከመዋዕለ ሕፃናት (ኬጂ) እስከ 12ኛ ክፍል — ብሔራዊ እና ዓለም አቀፍ ሥርዓተ ትምህርት',
    {
      x: rightCardX + 18,
      y: gridTop - 58,
      maxWidth: colW - 36,
      size: 8.5,
      lineHeight: 11.5,
      color: navy,
      isBold: true,
      fonts,
      align: 'center',
    }
  );

  const subjectBullets = [
    'ሒሳብ (ማቲማቲክስ) እና ፊዚክስ',
    'ኬሚስትሪ፣ ባዮሎጂ እና አጠቃላይ ሳይንስ',
    'እንግሊዝኛ፣ አማርኛ እና ንባብ',
    'የኮምፒውተር ትምህርት እና የፈተና ዝግጅት',
    'የዕለት ተዕለት የቤት ሥራ እና የጥናት እገዛ',
  ];

  let curRightY = gridTop - 98;
  for (const subj of subjectBullets) {
    page.drawCircle({
      x: rightCardX + 18,
      y: curRightY + 3,
      size: 2.7,
      color: emerald,
    });
    drawMixedText(page, subj, {
      x: rightCardX + 27,
      y: curRightY,
      size: 8.8,
      color: navy,
      isBold: false,
      fonts,
    });
    curRightY -= 17.5;
  }

  // Highlighted Soft-Blue Rounded Sub-Box for "3 Easy Steps"
  const stepsBoxY = gridBottom + 12;
  const stepsBoxH = 92;
  drawRoundedBox(page, {
    x: rightCardX + 12,
    y: stepsBoxY,
    width: colW - 24,
    height: stepsBoxH,
    radius: 10,
    color: rgb(0.941, 0.961, 0.992),
    borderColor: rgb(0.76, 0.84, 0.95),
    borderWidth: 1,
  });
  drawMixedText(page, 'በ3 ቀላል ደረጃዎች ይጀምሩ፡', {
    x: rightCardX + 22,
    y: stepsBoxY + stepsBoxH - 18,
    size: 9.5,
    color: navy,
    isBold: true,
    fonts,
  });

  const steps = [
    { num: '1', text: 'በድረ ገጻችን ይመዝገቡ ወይም በስልክ ይደውሉልን' },
    { num: '2', text: 'የልጅዎን ክፍል፣ ትምህርትና ሰዓት ይግለጹ' },
    { num: '3', text: 'ተስማሚ አስጠኚ በፍጥነት ይመደብልዎታል' },
  ];
  let stepY = stepsBoxY + stepsBoxH - 36;
  for (const st of steps) {
    page.drawCircle({
      x: rightCardX + 28,
      y: stepY + 3,
      size: 6.5,
      color: gold,
    });
    drawMixedCentered(page, st.num, {
      centerX: rightCardX + 28,
      y: stepY + 0.5,
      size: 7.5,
      color: navy,
      isBold: true,
      fonts,
    });
    drawMixedText(page, st.text, {
      x: rightCardX + 39,
      y: stepY,
      size: 8.2,
      color: slateText,
      isBold: false,
      fonts,
    });
    stepY -= 19;
  }

  // =========================================================================
  // 4. BOTTOM HIGH-IMPACT NAVY + GOLD CTA CONTACT BANNER
  // =========================================================================
  const ctaX = 24;
  const ctaY = 20;
  const ctaW = A4_W - 48; // 547.28
  const ctaH = 132;

  drawRoundedBox(page, {
    x: ctaX + 3,
    y: ctaY - 3,
    width: ctaW,
    height: ctaH,
    radius: 16,
    color: shadowColor,
  });
  drawRoundedBox(page, {
    x: ctaX,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    radius: 16,
    color: navy,
    borderColor: gold,
    borderWidth: 2.5,
  });

  // Left vibrant emerald+gold accent strip inside CTA banner
  page.drawSvgPath(customCornersPath(9, ctaH - 4, 14, 0, 0, 14), {
    x: ctaX + 2,
    y: ctaY + ctaH - 2,
    color: gold,
  });

  // QR Code Box on Right Side of CTA Banner
  const qrBoxSize = 94;
  const qrX = ctaX + ctaW - qrBoxSize - 16;
  const qrY = ctaY + 26;
  drawQrCodeVector(page, WEBSITE_URL, qrX, qrY, qrBoxSize, navy, white, gold);
  addUriLinkAnnotation(pdfDoc, page, [qrX, qrY, qrX + qrBoxSize, qrY + qrBoxSize], WEBSITE_URL);

  drawMixedCentered(page, 'በስልክዎ ስካን ያድርጉ', {
    centerX: qrX + qrBoxSize / 2,
    y: ctaY + 11,
    size: 8,
    color: gold,
    isBold: true,
    fonts,
  });

  // Left Contact Column inside CTA Banner
  const contactX = ctaX + 22;
  const contactMaxW = qrX - contactX - 14;

  drawMixedText(page, 'ዛሬውኑ ይመዝገቡ ወይም በቀጥታ ይደውሉልን!', {
    x: contactX,
    y: ctaY + ctaH - 25,
    size: 14,
    color: gold,
    isBold: true,
    fonts,
  });
  drawMixedText(
    page,
    'ለልጆችዎ ትክክለኛውን አስጠኚ ለማግኘት አሁኑኑ ይደውሉ ወይም ድረ ገጻችንን ይጎብኙ፡',
    {
      x: contactX,
      y: ctaY + ctaH - 42,
      size: 8.7,
      color: rgb(0.9, 0.94, 1),
      isBold: false,
      fonts,
    }
  );

  // Two Vibrant Bright-Gold Clickable Phone Pills
  const phoneBoxW = (contactMaxW - 12) / 2;
  const phoneBoxH = 29;
  const phoneY = ctaY + 49;

  drawRoundedBox(page, {
    x: contactX,
    y: phoneY,
    width: phoneBoxW,
    height: phoneBoxH,
    radius: 9,
    color: gold,
  });
  drawMixedCentered(page, `ስልክ ቁጥር 1፡  ${PHONE_1}`, {
    centerX: contactX + phoneBoxW / 2,
    y: phoneY + 10,
    size: 10.2,
    color: navy,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [contactX, phoneY, contactX + phoneBoxW, phoneY + phoneBoxH],
    `tel:${PHONE_1}`
  );

  const phone2X = contactX + phoneBoxW + 12;
  drawRoundedBox(page, {
    x: phone2X,
    y: phoneY,
    width: phoneBoxW,
    height: phoneBoxH,
    radius: 9,
    color: gold,
  });
  drawMixedCentered(page, `ስልክ ቁጥር 2፡  ${PHONE_2}`, {
    centerX: phone2X + phoneBoxW / 2,
    y: phoneY + 10,
    size: 10.2,
    color: navy,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [phone2X, phoneY, phone2X + phoneBoxW, phoneY + phoneBoxH],
    `tel:${PHONE_2}`
  );

  // Clean Bright White Website URL Bar
  const urlBoxY = ctaY + 13;
  const urlBoxH = 26;
  drawRoundedBox(page, {
    x: contactX,
    y: urlBoxY,
    width: contactMaxW,
    height: urlBoxH,
    radius: 8,
    color: white,
    borderColor: gold,
    borderWidth: 1.2,
  });
  const labelEndX = drawMixedText(page, 'ድረ ገጽ፡ ', {
    x: contactX + 10,
    y: urlBoxY + 9,
    size: 8.5,
    color: navy,
    isBold: true,
    fonts,
  });
  drawMixedText(page, WEBSITE_URL, {
    x: labelEndX,
    y: urlBoxY + 9,
    size: 7.3,
    color: emerald,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [contactX, urlBoxY, contactX + contactMaxW, urlBoxY + urlBoxH],
    WEBSITE_URL
  );

  const pdfBytes = await pdfDoc.save();

  const publicOut = path.join(rootDir, 'public/askuala_families_flyer.pdf');
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.writeFileSync(publicOut, pdfBytes);

  const artifactOut =
    '/.aistudio/artifacts/brain/2ef8de35-6516-463d-975d-012ea89f4229/askuala_families_flyer.pdf';
  fs.mkdirSync(path.dirname(artifactOut), { recursive: true });
  fs.writeFileSync(artifactOut, pdfBytes);

  console.log(`Generated vibrant flyer PDF (${(pdfBytes.length / 1024).toFixed(1)} KB)`);
}

generateFlyer().catch((err) => {
  console.error(err);
  process.exit(1);
});
