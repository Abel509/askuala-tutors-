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

function drawQrCodeVector(page, url, x, y, boxSize, darkColor, lightColor) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const count = modules.size;
  const pad = 7;
  const innerSize = boxSize - pad * 2;
  const cell = innerSize / count;

  page.drawRectangle({
    x,
    y,
    width: boxSize,
    height: boxSize,
    color: lightColor,
    borderColor: rgb(0.83, 0.65, 0.29),
    borderWidth: 1.2,
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

  const logoBytes = fs.readFileSync(
    path.join(rootDir, 'src/assets/images/askuala_astegniwoch_logo_1795698921792.jpg')
  );
  const heroBytes = fs.readFileSync(
    path.join(rootDir, 'src/assets/images/askuala_flyer_green_shirt_clean_1795699091652.jpg')
  );
  const [logoImg, heroImg] = await Promise.all([
    pdfDoc.embedJpg(logoBytes),
    pdfDoc.embedJpg(heroBytes),
  ]);

  const page = pdfDoc.addPage([A4_W, A4_H]);

  // Palette
  const ivoryBg = rgb(0.984, 0.973, 0.945); // #FBF8F1
  const emeraldDark = rgb(0.051, 0.204, 0.133); // #0D3422 matching emblem background
  const emeraldDeep = rgb(0.035, 0.145, 0.098); // #092519
  const emeraldMid = rgb(0.082, 0.325, 0.176); // #15532D
  const gold = rgb(0.831, 0.651, 0.29); // #D4A64A
  const goldLight = rgb(0.961, 0.855, 0.522); // #F5DA85
  const inkDark = rgb(0.09, 0.145, 0.125); // #172520
  const slateText = rgb(0.24, 0.29, 0.27); // #3D4A45
  const white = rgb(1, 1, 1);
  const cardBorder = rgb(0.85, 0.87, 0.85);

  // 1. Archival Ivory Background & Architectural Double Frame
  page.drawRectangle({ x: 0, y: 0, width: A4_W, height: A4_H, color: ivoryBg });
  page.drawRectangle({
    x: 14,
    y: 14,
    width: A4_W - 28,
    height: A4_H - 28,
    borderColor: emeraldDark,
    borderWidth: 1.3,
  });
  page.drawRectangle({
    x: 18,
    y: 18,
    width: A4_W - 36,
    height: A4_H - 36,
    borderColor: gold,
    borderWidth: 0.75,
  });

  // 2. Top Header Banner (Deep Forest Emerald + Gold Crest Logo)
  const headerH = 92;
  const headerY = A4_H - 18 - headerH; // 731.89
  page.drawRectangle({
    x: 18,
    y: headerY,
    width: A4_W - 36,
    height: headerH,
    color: emeraldDark,
  });
  // Gold bottom stripe under header
  page.drawRectangle({
    x: 18,
    y: headerY,
    width: A4_W - 36,
    height: 3.2,
    color: gold,
  });

  // Logo emblem neatly framed on the left
  const logoSize = 70;
  const logoX = 34;
  const logoY = headerY + (headerH - logoSize) / 2 + 1;
  page.drawImage(logoImg, {
    x: logoX,
    y: logoY,
    width: logoSize,
    height: logoSize,
  });
  page.drawRectangle({
    x: logoX,
    y: logoY,
    width: logoSize,
    height: logoSize,
    borderColor: gold,
    borderWidth: 1.0,
  });

  // Brand Title & Subtitle in Header
  const brandX = logoX + logoSize + 14;
  drawMixedText(page, 'ኣስኳላ አስጠኚዎች', {
    x: brandX,
    y: headerY + 50,
    size: 24,
    color: white,
    isBold: true,
    fonts,
  });
  drawMixedText(page, 'ጥራቱ የተረጋገጠ የቤት ለቤት እና የኦንላይን የጥናት አገልግሎት', {
    x: brandX,
    y: headerY + 26,
    size: 9.8,
    color: goldLight,
    isBold: false,
    fonts,
  });

  // Top-right badge: Families only & Addis Ababa
  const pillW = 136;
  const pillH = 22;
  const pillX = A4_W - 32 - pillW;
  const pillY = headerY + 49;
  page.drawRectangle({
    x: pillX,
    y: pillY,
    width: pillW,
    height: pillH,
    color: emeraldDeep,
    borderColor: gold,
    borderWidth: 0.9,
  });
  drawMixedCentered(page, 'ለወላጆች እና ለቤተሰቦች', {
    centerX: pillX + pillW / 2,
    y: pillY + 7,
    size: 9,
    color: goldLight,
    isBold: true,
    fonts,
  });
  drawMixedCentered(page, 'አዲስ አበባ · ኢትዮጵያ', {
    centerX: pillX + pillW / 2,
    y: headerY + 26,
    size: 8.8,
    color: rgb(0.86, 0.91, 0.88),
    isBold: false,
    fonts,
  });

  // 3. Main Headline & Family Subcopy
  const headlineY = headerY - 27; // ~705
  drawMixedCentered(page, 'ለልጆችዎ ብቁ፣ ታማኝ እና የተመረጡ አስጠኚዎችን ይፈልጋሉ?', {
    centerX: A4_W / 2,
    y: headlineY,
    size: 16.2,
    color: emeraldDark,
    isBold: true,
    fonts,
  });

  const subCopy =
    'በኣስኳላ አስጠኚዎች ከመዋዕለ ሕፃናት (ኬጂ) እስከ 12ኛ ክፍል ድረስ ለልጆችዎ የትምህርት ውጤት መሻሻልና በራስ መተማመን መዳበር የሚያግዙ፣ በትምህርት ብቃታቸውና በመልካም ሥነ ምግባራቸው የተመረጡ አስጠኚዎችን በቀላሉ ያገኛሉ።';
  drawMixedWrapped(page, subCopy, {
    x: 44,
    y: headlineY - 19,
    maxWidth: A4_W - 88,
    size: 9.6,
    lineHeight: 14,
    color: slateText,
    isBold: false,
    fonts,
    align: 'center',
  });

  // 4. Centerpiece Editorial Photo Card (Girl 18+ wearing branded green shirt tutoring a boy)
  const photoW = 344;
  const photoH = 258; // exact 4:3 aspect ratio
  const photoX = (A4_W - photoW) / 2;
  const photoY = 390;

  // Offset warm gold mat behind photo
  page.drawRectangle({
    x: photoX + 5,
    y: photoY - 5,
    width: photoW,
    height: photoH,
    color: gold,
  });
  page.drawImage(heroImg, {
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
  });

  // Render sharp Amharic brand name neatly BELOW the circular gold emblem on her green t-shirt
  const shirtTextCenterX = photoX + photoW * 0.522;
  const shirtTextY = photoY + photoH * 0.382;
  drawMixedCentered(page, 'ኣስኳላ አስጠኚዎች', {
    centerX: shirtTextCenterX,
    y: shirtTextY,
    size: 4.3,
    color: rgb(0.92, 0.78, 0.43),
    isBold: true,
    fonts,
    rotateDeg: -2.5,
  });

  // Caption ribbon at bottom edge of photo
  const capH = 24;
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: capH,
    color: emeraldDark,
    opacity: 0.93,
  });
  drawMixedCentered(page, 'በፍቅር፣ በትዕግሥት እና በጥልቅ እውቀት የልጆችዎን የትምህርት ጉዞ የሚደግፉ ብቁ አስጠኚዎች', {
    centerX: A4_W / 2,
    y: photoY + 8,
    size: 8.6,
    color: goldLight,
    isBold: true,
    fonts,
  });

  // Crisp gold border around photo card
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    borderColor: gold,
    borderWidth: 1.5,
  });

  // 5. Two-Column Information Grid (Benefits + Subjects & Steps)
  const gridTop = 374;
  const gridBottom = 160;
  const gridH = gridTop - gridBottom; // 214pt
  const gap = 14;
  const colW = (A4_W - 60 - gap) / 2; // (535.28 - 14)/2 = 260.64
  const leftX = 30;
  const rightX = leftX + colW + gap;

  // Left Card: Why Choose Askuala
  page.drawRectangle({
    x: leftX,
    y: gridBottom,
    width: colW,
    height: gridH,
    color: white,
    borderColor: cardBorder,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: leftX,
    y: gridTop - 3.5,
    width: colW,
    height: 3.5,
    color: emeraldDark,
  });

  drawMixedText(page, 'ለምን ኣስኳላ አስጠኚዎችን ይመርጣሉ?', {
    x: leftX + 14,
    y: gridTop - 22,
    size: 11.2,
    color: emeraldDark,
    isBold: true,
    fonts,
  });

  const whyItems = [
    {
      title: 'የተረጋገጠ ብቃትና ማንነት',
      desc: 'ሁሉም አስጠኚዎች የትምህርት ማስረጃቸውና ብሔራዊ መታወቂያቸው ተጣርቶ የተመረጡ ናቸው።',
    },
    {
      title: 'ከልጅዎ ፍላጎት ጋር የተጣጣመ',
      desc: 'እንደ ልጅዎ ክፍል፣ የትምህርት ዓይነት፣ የሳምንት ቀናትና ሰዓት ተስማሚ አስጠኚ እንመድባለን።',
    },
    {
      title: 'በቤትዎ በአካል ወይም በኦንላይን',
      desc: 'በአዲስ አበባ በቤትዎ በአካል ወይም በዘመናዊ ኦንላይን ትምህርት በምርጫዎ ይሰጣል።',
    },
    {
      title: 'ተከታታይ የውጤት ክትትል',
      desc: 'የቤት ሥራ እገዛ፣ የፈተና ዝግጅትና የልጅዎን የትምህርት እድገት በየጊዜው እንከታተላለን።',
    },
  ];

  let curLeftY = gridTop - 42;
  for (const item of whyItems) {
    // Gold square bullet marker
    page.drawRectangle({
      x: leftX + 14,
      y: curLeftY + 1.5,
      width: 5.5,
      height: 5.5,
      color: gold,
    });
    drawMixedText(page, item.title, {
      x: leftX + 25,
      y: curLeftY,
      size: 9.2,
      color: inkDark,
      isBold: true,
      fonts,
    });
    curLeftY = drawMixedWrapped(page, item.desc, {
      x: leftX + 25,
      y: curLeftY - 12,
      maxWidth: colW - 38,
      size: 8.1,
      lineHeight: 11,
      color: slateText,
      isBold: false,
      fonts,
    });
    curLeftY -= 6;
  }

  // Right Card: Subjects, Grades & 3 Simple Steps
  page.drawRectangle({
    x: rightX,
    y: gridBottom,
    width: colW,
    height: gridH,
    color: white,
    borderColor: cardBorder,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: rightX,
    y: gridTop - 3.5,
    width: colW,
    height: 3.5,
    color: gold,
  });

  drawMixedText(page, 'የሚሰጡ ትምህርቶችና የክፍል ደረጃዎች', {
    x: rightX + 14,
    y: gridTop - 22,
    size: 11.2,
    color: emeraldDark,
    isBold: true,
    fonts,
  });

  let curRightY = drawMixedWrapped(
    page,
    'ከመዋዕለ ሕፃናት (ኬጂ) እስከ 12ኛ ክፍል — ብሔራዊ እና ዓለም አቀፍ ሥርዓተ ትምህርት',
    {
      x: rightX + 14,
      y: gridTop - 38,
      maxWidth: colW - 28,
      size: 8.5,
      lineHeight: 11.5,
      color: emeraldMid,
      isBold: true,
      fonts,
    }
  );
  curRightY -= 5;

  const subjectBullets = [
    'ሒሳብ (ማቲማቲክስ) እና ፊዚክስ',
    'ኬሚስትሪ፣ ባዮሎጂ እና አጠቃላይ ሳይንስ',
    'እንግሊዝኛ፣ አማርኛ እና ንባብ',
    'የኮምፒውተር ትምህርት እና የፈተና ዝግጅት',
    'የዕለት ተዕለት የቤት ሥራ እና የጥናት እገዛ',
  ];

  for (const subj of subjectBullets) {
    page.drawCircle({
      x: rightX + 17,
      y: curRightY + 3,
      size: 2.2,
      color: emeraldMid,
    });
    drawMixedText(page, subj, {
      x: rightX + 25,
      y: curRightY,
      size: 8.6,
      color: inkDark,
      isBold: false,
      fonts,
    });
    curRightY -= 14.5;
  }

  // Divider inside right card
  curRightY += 2;
  page.drawLine({
    start: { x: rightX + 14, y: curRightY },
    end: { x: rightX + colW - 14, y: curRightY },
    thickness: 0.7,
    color: cardBorder,
  });
  curRightY -= 14;

  drawMixedText(page, 'በ3 ቀላል ደረጃዎች ይጀምሩ፡', {
    x: rightX + 14,
    y: curRightY,
    size: 9.2,
    color: emeraldDark,
    isBold: true,
    fonts,
  });
  curRightY -= 14;

  const steps = [
    '1. በድረ ገጻችን ይመዝገቡ ወይም በስልክ ይደውሉልን',
    '2. የልጅዎን ክፍል፣ ትምህርትና ሰዓት ይግለጹ',
    '3. ተስማሚ አስጠኚ በፍጥነት ይመደብልዎታል',
  ];
  for (const step of steps) {
    drawMixedText(page, step, {
      x: rightX + 16,
      y: curRightY,
      size: 8.2,
      color: slateText,
      isBold: false,
      fonts,
    });
    curRightY -= 13;
  }

  // 6. Bottom Call-to-Action & Contact Footer Banner
  const ctaX = 30;
  const ctaY = 30;
  const ctaW = A4_W - 60; // 535.28
  const ctaH = 118;

  page.drawRectangle({
    x: ctaX,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    color: emeraldDark,
    borderColor: gold,
    borderWidth: 1.5,
  });
  // Gold left bar accent
  page.drawRectangle({
    x: ctaX,
    y: ctaY,
    width: 6,
    height: ctaH,
    color: gold,
  });

  // QR Code Box on the Right Side of CTA Banner
  const qrBoxSize = 86;
  const qrX = ctaX + ctaW - qrBoxSize - 16;
  const qrY = ctaY + 22;
  drawQrCodeVector(page, WEBSITE_URL, qrX, qrY, qrBoxSize, emeraldDark, ivoryBg);
  addUriLinkAnnotation(pdfDoc, page, [qrX, qrY, qrX + qrBoxSize, qrY + qrBoxSize], WEBSITE_URL);

  drawMixedCentered(page, 'በስልክዎ ስካን ያድርጉ', {
    centerX: qrX + qrBoxSize / 2,
    y: ctaY + 9,
    size: 7.8,
    color: goldLight,
    isBold: true,
    fonts,
  });

  // Left Contact Column inside CTA Banner
  const contactX = ctaX + 20;
  const contactMaxW = qrX - contactX - 14;

  drawMixedText(page, 'ዛሬውኑ ይመዝገቡ ወይም በቀጥታ ይደውሉልን!', {
    x: contactX,
    y: ctaY + ctaH - 22,
    size: 13.5,
    color: goldLight,
    isBold: true,
    fonts,
  });
  drawMixedText(
    page,
    'ለልጆችዎ ትክክለኛውን አስጠኚ ለማግኘት አሁኑኑ ይደውሉ ወይም ድረ ገጻችንን ይጎብኙ፡',
    {
      x: contactX,
      y: ctaY + ctaH - 38,
      size: 8.6,
      color: rgb(0.89, 0.93, 0.91),
      isBold: false,
      fonts,
    }
  );

  // Two side-by-side clickable Phone Pills
  const phoneBoxW = 178;
  const phoneBoxH = 26;
  const phoneY = ctaY + 42;

  // Phone 1 Box
  page.drawRectangle({
    x: contactX,
    y: phoneY,
    width: phoneBoxW,
    height: phoneBoxH,
    color: emeraldDeep,
    borderColor: gold,
    borderWidth: 1,
  });
  drawMixedCentered(page, `ስልክ ቁጥር 1፡  ${PHONE_1}`, {
    centerX: contactX + phoneBoxW / 2,
    y: phoneY + 8.5,
    size: 10,
    color: white,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [contactX, phoneY, contactX + phoneBoxW, phoneY + phoneBoxH],
    `tel:${PHONE_1}`
  );

  // Phone 2 Box
  const phone2X = contactX + phoneBoxW + 12;
  page.drawRectangle({
    x: phone2X,
    y: phoneY,
    width: phoneBoxW,
    height: phoneBoxH,
    color: emeraldDeep,
    borderColor: gold,
    borderWidth: 1,
  });
  drawMixedCentered(page, `ስልክ ቁጥር 2፡  ${PHONE_2}`, {
    centerX: phone2X + phoneBoxW / 2,
    y: phoneY + 8.5,
    size: 10,
    color: white,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [phone2X, phoneY, phone2X + phoneBoxW, phoneY + phoneBoxH],
    `tel:${PHONE_2}`
  );

  // Website Link Pill
  const urlBoxY = ctaY + 11;
  const urlBoxH = 23;
  const urlBoxW = contactMaxW;
  page.drawRectangle({
    x: contactX,
    y: urlBoxY,
    width: urlBoxW,
    height: urlBoxH,
    color: ivoryBg,
    borderColor: gold,
    borderWidth: 0.9,
  });
  const labelEndX = drawMixedText(page, 'ድረ ገጽ፡ ', {
    x: contactX + 8,
    y: urlBoxY + 7.5,
    size: 8.2,
    color: emeraldDark,
    isBold: true,
    fonts,
  });
  drawMixedText(page, WEBSITE_URL, {
    x: labelEndX,
    y: urlBoxY + 7.5,
    size: 7.1,
    color: emeraldMid,
    isBold: true,
    fonts,
  });
  addUriLinkAnnotation(
    pdfDoc,
    page,
    [contactX, urlBoxY, contactX + urlBoxW, urlBoxY + urlBoxH],
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

  console.log(`Generated flyer PDF (${(pdfBytes.length / 1024).toFixed(1)} KB):`);
  console.log(` - ${publicOut}`);
  console.log(` - ${artifactOut}`);
}

generateFlyer().catch((err) => {
  console.error(err);
  process.exit(1);
});
