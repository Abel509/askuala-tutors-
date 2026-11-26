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
    y,
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

// Crisp vector logo matching the exact open-book + rising scholar + gold star emblem on her green t-shirt
function drawAskualaHeaderLogo(page, x, y, boxSize) {
  const brandGreen = rgb(0.0, 0.541, 0.235); // #008A3C vibrant polo green
  const navy = rgb(0.043, 0.165, 0.369); // #0B2A5E
  const gold = rgb(0.976, 0.769, 0.118); // #F9C41E
  const white = rgb(1, 1, 1);

  drawRoundedBox(page, {
    x,
    y,
    width: boxSize,
    height: boxSize,
    radius: 14,
    color: white,
    borderColor: gold,
    borderWidth: 1.8,
  });

  const scale = boxSize / 56;
  const topY = y + boxSize;

  // Soft golden aura ring behind emblem
  page.drawCircle({
    x: x + boxSize / 2,
    y: y + boxSize / 2,
    size: 22 * scale,
    color: rgb(0.96, 0.99, 0.97),
  });

  // Left & Right Navy/Green Book Pages
  page.drawSvgPath(
    'M 8,36 C 14,32 22,33 27.5,39 L 27.5,45 C 21,40 13,40 7,43 Z',
    { x, y: topY, scale, color: navy }
  );
  page.drawSvgPath(
    'M 48,36 C 42,32 34,33 28.5,39 L 28.5,45 C 35,40 43,40 49,43 Z',
    { x, y: topY, scale, color: navy }
  );

  // Inner Golden Pages
  page.drawSvgPath(
    'M 10,32 C 16,29 22,30 27.5,35.5 L 27.5,38 C 22,33.5 15,32.5 9.5,35 Z',
    { x, y: topY, scale, color: gold }
  );
  page.drawSvgPath(
    'M 46,32 C 40,29 34,30 28.5,35.5 L 28.5,38 C 34,33.5 41,32.5 46.5,35 Z',
    { x, y: topY, scale, color: gold }
  );

  // Joyful scholar silhouette rising from center book
  page.drawSvgPath(
    'M 18.5,20 C 22,25 25,28 28,33 C 31,27 35,21 40,14 C 37,20 33,27 30.5,35 L 25.5,35 C 23,28 20.5,24 18.5,20 Z',
    { x, y: topY, scale, color: brandGreen }
  );
  page.drawCircle({
    x: x + 28 * scale,
    y: topY - 21 * scale,
    size: 4.1 * scale,
    color: navy,
  });

  // Bright Golden Star
  page.drawSvgPath(
    'M 40.5,5.5 L 42.1,9.7 L 46.6,9.9 L 43.1,12.7 L 44.3,17 L 40.5,14.5 L 36.7,17 L 37.9,12.7 L 34.4,9.9 L 38.9,9.7 Z',
    { x, y: topY, scale, color: gold }
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

function drawQrCodeVector(page, url, x, y, boxSize, darkColor, lightColor, borderGold) {
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
    borderColor: borderGold,
    borderWidth: 1.6,
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
    path.join(rootDir, 'src/assets/images/askuala_flyer_wide_tutor_boy_1795701383591.jpg')
  );
  const heroImg = await pdfDoc.embedJpg(heroBytes);

  const page = pdfDoc.addPage([A4_W, A4_H]);

  // Vibrant T-Shirt Kelly Green Palette + Warm Gold + Crisp White
  const pageBg = rgb(0.976, 0.992, 0.98); // #F9FDFA fresh crisp mint-white
  const tGreen = rgb(0.0, 0.541, 0.235); // #008A3C exact vibrant t-shirt green
  const tGreenDeep = rgb(0.0, 0.431, 0.184); // #006E2F slightly deeper green for contrast pills
  const tGreenSoft = rgb(0.914, 0.98, 0.937); // #E9FAF0 fresh pale green tint
  const gold = rgb(0.961, 0.761, 0.149); // #F5C226 vibrant warm gold
  const goldSoft = rgb(0.996, 0.957, 0.804); // #FEF4CD warm butter gold
  const inkDark = rgb(0.055, 0.165, 0.102); // #0E2A1A clean readable dark forest ink
  const slateText = rgb(0.22, 0.29, 0.25);
  const white = rgb(1, 1, 1);
  const cardBorder = rgb(0.81, 0.92, 0.85);
  const shadowTint = rgb(0.84, 0.91, 0.86);

  // 1. Fresh Crisp Background & Sleek Outer Frame
  page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: pageBg });
  page.drawRectangle({
    x: 14,
    y: 14,
    width: A4_W - 28,
    height: A4_H - 28,
    borderColor: tGreen,
    borderWidth: 1.5,
  });
  page.drawRectangle({
    x: 18,
    y: 18,
    width: A4_W - 36,
    height: A4_H - 36,
    borderColor: gold,
    borderWidth: 0.85,
  });

  // 2. Top Vibrant T-Shirt Green Header Banner
  const headerH = 84;
  const headerY = A4_H - 18 - headerH; // 739.89
  page.drawRectangle({
    x: 18,
    y: headerY,
    width: A4_W - 36,
    height: headerH,
    color: tGreen,
  });
  page.drawRectangle({
    x: 18,
    y: headerY,
    width: A4_W - 36,
    height: 3.5,
    color: gold,
  });

  // Matching Crisp White Rounded Logo Badge in Header
  const logoSize = 62;
  const logoX = 32;
  const logoY = headerY + (headerH - logoSize) / 2 + 1;
  drawAskualaHeaderLogo(page, logoX, logoY, logoSize);

  const brandX = logoX + logoSize + 14;
  drawMixedText(page, 'ኣስኳላ አስጠኚዎች', {
    x: brandX,
    y: headerY + 46,
    size: 24,
    color: white,
    isBold: true,
    fonts,
  });
  drawMixedText(page, 'ጥራቱ የተረጋገጠ የቤት ለቤት እና የኦንላይን የጥናት አገልግሎት', {
    x: brandX,
    y: headerY + 23,
    size: 9.7,
    color: goldSoft,
    isBold: true,
    fonts,
  });

  // Right-side Audience & Location Pills
  const pillW = 142;
  const pillH = 22;
  const pillX = A4_W - 32 - pillW;
  const pillY = headerY + 46;
  drawRoundedBox(page, {
    x: pillX,
    y: pillY,
    width: pillW,
    height: pillH,
    radius: 8,
    color: tGreenDeep,
    borderColor: gold,
    borderWidth: 1.1,
  });
  drawMixedCentered(page, 'ለወላጆች እና ለቤተሰቦች', {
    centerX: pillX + pillW / 2,
    y: pillY + 7.5,
    size: 9.2,
    color: white,
    isBold: true,
    fonts,
  });
  drawMixedCentered(page, 'አዲስ አበባ · ኢትዮጵያ', {
    centerX: pillX + pillW / 2,
    y: headerY + 23,
    size: 8.8,
    color: goldSoft,
    isBold: false,
    fonts,
  });

  // 3. Top Headline & Family Subcopy (Above Photo)
  const headlineY = headerY - 24; // ~716
  drawMixedCentered(page, 'ለልጆችዎ ብቁ፣ ታማኝ እና የተመረጡ አስጠኚዎችን ይፈልጋሉ?', {
    centerX: A4_W / 2,
    y: headlineY,
    size: 16.5,
    color: tGreenDeep,
    isBold: true,
    fonts,
  });

  const subCopy =
    'በኣስኳላ አስጠኚዎች ከመዋዕለ ሕፃናት (ኬጂ) እስከ 12ኛ ክፍል ድረስ ለልጆችዎ የትምህርት ውጤት መሻሻልና በራስ መተማመን መዳበር የሚያግዙ፣ በትምህርት ብቃታቸውና በመልካም ሥነ ምግባራቸው የተመረጡ አስጠኚዎችን በቀላሉ ያገኛሉ።';
  drawMixedWrapped(page, subCopy, {
    x: 34,
    y: headlineY - 17,
    maxWidth: A4_W - 68,
    size: 9.2,
    lineHeight: 13.2,
    color: slateText,
    isBold: false,
    fonts,
    align: 'center',
  });

  // 4. FULL-WIDTH MIDDLE SHOWCASE PHOTO (Fills ALL middle horizontal space!)
  // Aligned flush left-to-right with the 2 cards & CTA box: x = 28, w = 539.28, exact 16:9 -> h = 303.34
  const photoX = 28;
  const photoW = A4_W - 56; // 539.28
  const photoH = (photoW * 9) / 16; // 303.345 exact 16:9 ratio
  const photoY = 374; // top of photo ~ 677.34, cleanly below subcopy!

  // Subtle offset shadow & gold highlight frame
  drawRoundedBox(page, {
    x: photoX + 4,
    y: photoY - 4,
    width: photoW,
    height: photoH,
    radius: 10,
    color: shadowTint,
  });
  page.drawImage(heroImg, {
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
  });

  // Vibrant T-Shirt Green caption strip anchored cleanly along bottom of full-width photo
  const capH = 24;
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: capH,
    color: tGreen,
    opacity: 0.94,
  });
  page.drawRectangle({
    x: photoX,
    y: photoY + capH,
    width: photoW,
    height: 1.6,
    color: gold,
  });
  drawMixedCentered(page, 'በፍቅር፣ በትዕግሥት እና በጥልቅ እውቀት የልጆችዎን የትምህርት ጉዞ የሚደግፉ ብቁ አስጠኚዎች', {
    centerX: A4_W / 2,
    y: photoY + 8,
    size: 9.2,
    color: white,
    isBold: true,
    fonts,
  });

  // Crisp gold outer frame around full-width showcase photo
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    borderColor: gold,
    borderWidth: 1.8,
  });

  // 5. TWO-COLUMN CARDS (Immediately below photo, clean spacing, matching green & gold theme)
  const gridTop = 362;
  const gridBottom = 152;
  const gridH = gridTop - gridBottom; // 210pt
  const gap = 14;
  const colW = (photoW - gap) / 2; // 262.64
  const leftX = photoX;
  const rightX = leftX + colW + gap;

  // --- LEFT CARD ---
  drawRoundedBox(page, {
    x: leftX + 3,
    y: gridBottom - 3,
    width: colW,
    height: gridH,
    radius: 10,
    color: shadowTint,
  });
  drawRoundedBox(page, {
    x: leftX,
    y: gridBottom,
    width: colW,
    height: gridH,
    radius: 10,
    color: white,
    borderColor: cardBorder,
    borderWidth: 1.1,
  });
  page.drawSvgPath(customCornersPath(colW, 29, 10, 10, 0, 0), {
    x: leftX,
    y: gridTop,
    color: tGreen,
  });
  page.drawRectangle({
    x: leftX,
    y: gridTop - 31,
    width: colW,
    height: 2,
    color: gold,
  });
  drawMixedText(page, 'ለምን ኣስኳላ አስጠኚዎችን ይመርጣሉ?', {
    x: leftX + 13,
    y: gridTop - 19,
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

  let curLeftY = gridTop - 46;
  for (const item of whyItems) {
    drawRoundedBox(page, {
      x: leftX + 12,
      y: curLeftY - 9,
      width: 17,
      height: 17,
      radius: 5,
      color: tGreenSoft,
      borderColor: tGreen,
      borderWidth: 0.9,
    });
    drawMixedCentered(page, item.num, {
      centerX: leftX + 20.5,
      y: curLeftY - 3.5,
      size: 8.5,
      color: tGreenDeep,
      isBold: true,
      fonts,
    });
    drawMixedText(page, item.title, {
      x: leftX + 35,
      y: curLeftY - 1,
      size: 9.2,
      color: inkDark,
      isBold: true,
      fonts,
    });
    curLeftY = drawMixedWrapped(page, item.desc, {
      x: leftX + 35,
      y: curLeftY - 13,
      maxWidth: colW - 46,
      size: 8,
      lineHeight: 10.6,
      color: slateText,
      isBold: false,
      fonts,
    });
    curLeftY -= 6;
  }

  // --- RIGHT CARD ---
  drawRoundedBox(page, {
    x: rightX + 3,
    y: gridBottom - 3,
    width: colW,
    height: gridH,
    radius: 10,
    color: shadowTint,
  });
  drawRoundedBox(page, {
    x: rightX,
    y: gridBottom,
    width: colW,
    height: gridH,
    radius: 10,
    color: white,
    borderColor: cardBorder,
    borderWidth: 1.1,
  });
  page.drawSvgPath(customCornersPath(colW, 29, 10, 10, 0, 0), {
    x: rightX,
    y: gridTop,
    color: tGreen,
  });
  page.drawRectangle({
    x: rightX,
    y: gridTop - 31,
    width: colW,
    height: 2,
    color: gold,
  });
  drawMixedText(page, 'የሚሰጡ ትምህርቶችና የክፍል ደረጃዎች', {
    x: rightX + 13,
    y: gridTop - 19,
    size: 10.6,
    color: white,
    isBold: true,
    fonts,
  });

  drawRoundedBox(page, {
    x: rightX + 11,
    y: gridTop - 64,
    width: colW - 22,
    height: 26,
    radius: 6,
    color: goldSoft,
    borderColor: gold,
    borderWidth: 0.8,
  });
  drawMixedWrapped(
    page,
    'ከመዋዕለ ሕፃናት (ኬጂ) እስከ 12ኛ ክፍል — ብሔራዊ እና ዓለም አቀፍ ሥርዓተ ትምህርት',
    {
      x: rightX + 15,
      y: gridTop - 48,
      maxWidth: colW - 30,
      size: 7.9,
      lineHeight: 10.2,
      color: inkDark,
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

  let curRightY = gridTop - 78;
  for (const subj of subjectBullets) {
    page.drawCircle({
      x: rightX + 17,
      y: curRightY + 3,
      size: 2.3,
      color: tGreen,
    });
    drawMixedText(page, subj, {
      x: rightX + 25,
      y: curRightY,
      size: 8.3,
      color: inkDark,
      isBold: false,
      fonts,
    });
    curRightY -= 13.5;
  }

  // Highlighted Soft-Green Box for "3 Easy Steps"
  const stepsBoxY = gridBottom + 9;
  const stepsBoxH = 58;
  drawRoundedBox(page, {
    x: rightX + 11,
    y: stepsBoxY,
    width: colW - 22,
    height: stepsBoxH,
    radius: 7,
    color: tGreenSoft,
    borderColor: cardBorder,
    borderWidth: 0.9,
  });
  drawMixedText(page, 'በ3 ቀላል ደረጃዎች ይጀምሩ፡', {
    x: rightX + 18,
    y: stepsBoxY + stepsBoxH - 13,
    size: 8.6,
    color: tGreenDeep,
    isBold: true,
    fonts,
  });

  const steps = [
    '1. በድረ ገጻችን ይመዝገቡ ወይም በስልክ ይደውሉልን',
    '2. የልጅዎን ክፍል፣ ትምህርትና ሰዓት ይግለጹ',
    '3. ተስማሚ አስጠኚ በፍጥነት ይመደብልዎታል',
  ];
  let stepY = stepsBoxY + stepsBoxH - 26;
  for (const step of steps) {
    drawMixedText(page, step, {
      x: rightX + 20,
      y: stepY,
      size: 7.9,
      color: slateText,
      isBold: false,
      fonts,
    });
    stepY -= 12.2;
  }

  // 6. BOTTOM CTA & CONTACT BANNER (Vibrant T-Shirt Green + Bright Gold)
  const ctaX = photoX;
  const ctaY = 24;
  const ctaW = photoW;
  const ctaH = 118;

  drawRoundedBox(page, {
    x: ctaX + 3,
    y: ctaY - 3,
    width: ctaW,
    height: ctaH,
    radius: 12,
    color: shadowTint,
  });
  drawRoundedBox(page, {
    x: ctaX,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    radius: 12,
    color: tGreen,
    borderColor: gold,
    borderWidth: 2,
  });
  page.drawSvgPath(customCornersPath(7, ctaH - 4, 10, 0, 0, 10), {
    x: ctaX + 2,
    y: ctaY + ctaH - 2,
    color: gold,
  });

  // QR Code Box on Right Side of CTA Banner
  const qrBoxSize = 86;
  const qrX = ctaX + ctaW - qrBoxSize - 15;
  const qrY = ctaY + 21;
  drawQrCodeVector(page, WEBSITE_URL, qrX, qrY, qrBoxSize, tGreenDeep, white, gold);
  addUriLinkAnnotation(pdfDoc, page, [qrX, qrY, qrX + qrBoxSize, qrY + qrBoxSize], WEBSITE_URL);

  drawMixedCentered(page, 'በስልክዎ ስካን ያድርጉ', {
    centerX: qrX + qrBoxSize / 2,
    y: ctaY + 8.5,
    size: 7.8,
    color: goldSoft,
    isBold: true,
    fonts,
  });

  // Contact Details on Left Side of CTA Banner
  const contactX = ctaX + 20;
  const contactMaxW = qrX - contactX - 14;

  drawMixedText(page, 'ዛሬውኑ ይመዝገቡ ወይም በቀጥታ ይደውሉልን!', {
    x: contactX,
    y: ctaY + ctaH - 22,
    size: 13.5,
    color: goldSoft,
    isBold: true,
    fonts,
  });
  drawMixedText(
    page,
    'ለልጆችዎ ትክክለኛውን አስጠኚ ለማግኘት አሁኑኑ ይደውሉ ወይም ድረ ገጻችንን ይጎብኙ፡',
    {
      x: contactX,
      y: ctaY + ctaH - 38,
      size: 8.5,
      color: white,
      isBold: false,
      fonts,
    }
  );

  // Two Clickable Vibrant Gold Phone Pills
  const phoneBoxW = (contactMaxW - 12) / 2;
  const phoneBoxH = 26;
  const phoneY = ctaY + 42;

  drawRoundedBox(page, {
    x: contactX,
    y: phoneY,
    width: phoneBoxW,
    height: phoneBoxH,
    radius: 8,
    color: gold,
  });
  drawMixedCentered(page, `ስልክ ቁጥር 1፡  ${PHONE_1}`, {
    centerX: contactX + phoneBoxW / 2,
    y: phoneY + 8.5,
    size: 10,
    color: inkDark,
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
    radius: 8,
    color: gold,
  });
  drawMixedCentered(page, `ስልክ ቁጥር 2፡  ${PHONE_2}`, {
    centerX: phone2X + phoneBoxW / 2,
    y: phoneY + 8.5,
    size: 10,
    color: inkDark,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [phone2X, phoneY, phone2X + phoneBoxW, phoneY + phoneBoxH],
    `tel:${PHONE_2}`
  );

  // Clean White Website Link Bar
  const urlBoxY = ctaY + 11;
  const urlBoxH = 23;
  drawRoundedBox(page, {
    x: contactX,
    y: urlBoxY,
    width: contactMaxW,
    height: urlBoxH,
    radius: 7,
    color: white,
    borderColor: gold,
    borderWidth: 1,
  });
  const labelEndX = drawMixedText(page, 'ድረ ገጽ፡ ', {
    x: contactX + 9,
    y: urlBoxY + 7.5,
    size: 8.2,
    color: inkDark,
    isBold: true,
    fonts,
  });
  drawMixedText(page, WEBSITE_URL, {
    x: labelEndX,
    y: urlBoxY + 7.5,
    size: 7.2,
    color: tGreenDeep,
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

  console.log(`Generated full-middle vibrant green flyer PDF (${(pdfBytes.length / 1024).toFixed(1)} KB)`);
}

generateFlyer().catch((err) => {
  console.error(err);
  process.exit(1);
});
