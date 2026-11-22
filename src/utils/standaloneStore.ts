import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type {
  AdminParentItem,
  AdminTutorItem,
  MatchRecord,
  ParentApplication,
  TutorApplication,
  UserAccount,
  UserRole,
} from '../types/app';

const STORE_KEY = 'askuala_standalone_db_v1';
const PDF_MEM_STORE = new Map<string, Uint8Array>();

interface StoredUser extends UserAccount {
  password: string;
}

interface StandaloneDb {
  ownerPasscode?: string;
  users: StoredUser[];
  currentUserId: string | null;
  tutorApplications: TutorApplication[];
  parentApplications: ParentApplication[];
  matches: MatchRecord[];
}

function normalizePhone(raw: string): string | null {
  const cleaned = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^\+251[97]\d{8}$/.test(cleaned)) return cleaned;
  if (/^251[97]\d{8}$/.test(cleaned)) return '+' + cleaned;
  if (/^0[97]\d{8}$/.test(cleaned)) return '+251' + cleaned.slice(1);
  return null;
}

function openPdfIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('askuala_pdfs_v1', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveStandalonePdfBytes(fileId: string, bytes: Uint8Array): Promise<void> {
  PDF_MEM_STORE.set(fileId, bytes);
  try {
    const idb = await openPdfIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction('pdfs', 'readwrite');
      tx.objectStore('pdfs').put(bytes, fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Memory cache remains available for the session
  }
}

export async function loadStandalonePdfBytes(fileId: string): Promise<Uint8Array | null> {
  if (PDF_MEM_STORE.has(fileId)) {
    return PDF_MEM_STORE.get(fileId)!;
  }
  try {
    const idb = await openPdfIdb();
    const res = await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = idb.transaction('pdfs', 'readonly');
      const req = tx.objectStore('pdfs').get(fileId);
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) || null);
      req.onerror = () => reject(req.error);
    });
    if (res) PDF_MEM_STORE.set(fileId, res);
    return res;
  } catch {
    return null;
  }
}

async function createSamplePdfBytes(title: string, lines: string[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawRectangle({ x: 40, y: 740, width: 515, height: 60, color: rgb(0.067, 0.176, 0.122) });
  page.drawText('Askuala Tutors - Official Academic Record', {
    x: 56,
    y: 772,
    size: 16,
    font: fontBold,
    color: rgb(0.984, 0.973, 0.945),
  });
  page.drawText(title, {
    x: 56,
    y: 752,
    size: 11,
    font: fontRegular,
    color: rgb(0.96, 0.84, 0.56),
  });

  let y = 700;
  for (const line of lines) {
    page.drawText(line, { x: 56, y, size: 12, font: fontRegular, color: rgb(0.07, 0.13, 0.09) });
    y -= 24;
  }
  return pdfDoc.save();
}

function seedStandaloneDb(): StandaloneDb {
  const now = new Date().toISOString();
  const db: StandaloneDb = {
    ownerPasscode: 'askuala@2026',
    users: [
      {
        id: 'user_admin_1',
        phone: '+251911000000',
        role: 'admin',
        fullName: 'Askuala Coordinator',
        password: 'Askuala#1',
        createdAt: now,
      },
      {
        id: 'user_tutor_1',
        phone: '+251911223344',
        role: 'tutor',
        fullName: 'Dawit Tesfaye Bekele',
        password: 'Tutor#89A',
        createdAt: now,
      },
      {
        id: 'user_tutor_2',
        phone: '+251922334455',
        role: 'tutor',
        fullName: 'Mekdes Alemu Girma',
        password: 'Tutor#92B',
        createdAt: now,
      },
      {
        id: 'user_parent_1',
        phone: '+251933445566',
        role: 'parent',
        fullName: 'አቶ ታደሰ ገብረማርያም',
        password: 'Parent#88',
        createdAt: now,
      },
    ],
    currentUserId: null,
    tutorApplications: [
      {
        id: 'tapp_1',
        userId: 'user_tutor_1',
        status: 'verified',
        profile: {
          fullName: 'Dawit Tesfaye Bekele',
          phone: '+251911223344',
          sex: 'male',
          educationLevel: 'college',
          tutoringMode: 'both',
          priorExperience: '2_plus_years',
          preferredLocations: ['4_kilo', '5_kilo', '6_kilo', 'piassa', 'bole'],
          preferredSubjects: ['mathematics', 'physics', 'chemistry', 'ict', 'entrance_exam'],
          preferredDays: ['monday', 'wednesday', 'friday', 'saturday'],
          weekdaySlots: ['wd_10_11', 'wd_11_12', 'wd_12_1'],
          weekendSlots: ['we_3_4', 'we_4_5', 'we_9_10', 'we_10_11'],
          expectedFeePerHour: '400_600',
        },
        academicRecords: {
          grade9Avg: '91.5',
          grade10Avg: '93',
          grade11Avg: '90.4',
          grade12Avg: '92.2',
          esslceOutOf600: '548',
        },
        uploadedDocuments: [
          {
            recordKey: 'grade_9_12_transcript',
            label: 'Grades 9–12 Complete Transcripts (PDF)',
            fileId: 'sample_tutor1_transcript',
            filename: 'Dawit_Grades_9_12_Transcript.pdf',
            pageCount: 1,
            sizeBytes: 4200,
          },
        ],
        mergedPdfFileId: 'sample_tutor1_dossier',
        mergedPdfFilename: 'Dawit_Tesfaye_Askuala_Application.pdf',
        submittedAt: now,
        updatedAt: now,
      },
      {
        id: 'tapp_2',
        userId: 'user_tutor_2',
        status: 'verified',
        profile: {
          fullName: 'Mekdes Alemu Girma',
          phone: '+251922334455',
          sex: 'female',
          educationLevel: 'bachelors',
          tutoringMode: 'both',
          priorExperience: '2_plus_years',
          preferredLocations: ['bole', 'megenagna', 'cmc', 'ayat', 'gerji', 'kazanchis', '4_kilo'],
          preferredSubjects: [
            'mathematics',
            'biology',
            'chemistry',
            'english',
            'spoken_english',
            'afan_oromo',
            'entrance_exam',
          ],
          preferredDays: ['tuesday', 'thursday', 'saturday', 'sunday'],
          weekdaySlots: ['wd_10_11', 'wd_11_12'],
          weekendSlots: ['we_3_4', 'we_4_5', 'we_8_9', 'we_9_10', 'we_10_11'],
          expectedFeePerHour: '600_plus',
        },
        academicRecords: {
          graduationCgpa: '3.84',
          esslceOutOf600: '532',
        },
        uploadedDocuments: [
          {
            recordKey: 'graduation_cgpa_transcript',
            label: "Bachelor's Degree & Official CGPA Transcript (PDF)",
            fileId: 'sample_tutor2_transcript',
            filename: 'Mekdes_Degree_CGPA_Transcript.pdf',
            pageCount: 1,
            sizeBytes: 3900,
          },
        ],
        mergedPdfFileId: 'sample_tutor2_dossier',
        mergedPdfFilename: 'Mekdes_Alemu_Askuala_Application.pdf',
        submittedAt: now,
        updatedAt: now,
      },
    ],
    parentApplications: [
      {
        id: 'papp_1',
        userId: 'user_parent_1',
        status: 'submitted',
        parentProfile: {
          fullName: 'አቶ ታደሰ ገብረማርያም',
          phone: '+251933445566',
          location: '4_kilo',
          expectedPaymentPerHour: 'max_600',
        },
        kidsCountChoice: '1',
        kidsCountNumber: 1,
        kids: [
          {
            id: 'kid_1',
            gradeLevel: 'grade_8',
            selectedDays: ['monday', 'wednesday', 'saturday'],
            hoursPerDay: '2',
            weekdaySlots: ['wd_10_11', 'wd_11_12'],
            weekendSlots: ['we_3_4', 'we_4_5'],
            schoolType: 'private',
            privateCurriculum: 'standard',
            preferredSubjects: ['mathematics', 'physics', 'english'],
            subjectStatus: 'medium',
          },
        ],
        tutorPreference: { sex: 'any', mode: 'in_person' },
        submittedAt: now,
        updatedAt: now,
      },
    ],
    matches: [],
  };
  recomputeMatches(db);
  return db;
}

function getDb(): StandaloneDb {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as StandaloneDb;
  } catch {
    // ignore
  }
  const seeded = seedStandaloneDb();
  saveDb(seeded);
  return seeded;
}

function saveDb(db: StandaloneDb) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    // ignore quota error
  }
}

function feeSatisfiesBudget(tutorFee: string, budget: string): boolean {
  if (tutorFee === '400_600') {
    return budget === '400_500' || budget === 'max_600' || budget === '600_700_efficiency';
  }
  if (tutorFee === '600_plus') {
    return budget === '600_700_efficiency';
  }
  const feeNum = tutorFee === '700_plus' ? 700 : Number(tutorFee || 500);
  if (budget === '400_500') return feeNum <= 500;
  if (budget === 'max_600') return feeNum <= 600;
  if (budget === '600_700_efficiency') return feeNum <= 700;
  return true;
}

function recomputeMatches(db: StandaloneDb) {
  const existingMap = new Map<string, MatchRecord>();
  for (const m of db.matches) {
    existingMap.set(`${m.parentAppId}::${m.tutorAppId}`, m);
  }
  const nextMatches: MatchRecord[] = [];
  const activeTutors = db.tutorApplications.filter(
    (t) => t.status === 'verified' || t.status === 'submitted'
  );
  const activeParents = db.parentApplications.filter(
    (p) => p.status === 'submitted' || p.status === 'matched'
  );

  for (const parent of activeParents) {
    const allKidSubjects = Array.from(new Set(parent.kids.flatMap((k) => k.preferredSubjects)));
    const allKidDays = Array.from(new Set(parent.kids.flatMap((k) => k.selectedDays)));
    const allKidSlots = Array.from(
      new Set(parent.kids.flatMap((k) => [...k.weekdaySlots, ...k.weekendSlots]))
    );

    for (const tutor of activeTutors) {
      const modeOk =
        tutor.profile.tutoringMode === 'both' ||
        tutor.profile.tutoringMode === parent.tutorPreference.mode;
      if (!modeOk) continue;

      const sexOk =
        !parent.tutorPreference.sex ||
        parent.tutorPreference.sex === 'any' ||
        parent.tutorPreference.sex === tutor.profile.sex;
      if (!sexOk) continue;

      const locMatched =
        parent.tutorPreference.mode === 'online'
          ? true
          : tutor.profile.preferredLocations.includes(parent.parentProfile.location);
      if (parent.tutorPreference.mode === 'in_person' && !locMatched) continue;

      const matchedSubjects = allKidSubjects.filter((s) =>
        tutor.profile.preferredSubjects.includes(s)
      );
      if (matchedSubjects.length === 0) continue;

      const tutorSlots = [...tutor.profile.weekdaySlots, ...tutor.profile.weekendSlots];
      const matchedDays = allKidDays.filter((d) => tutor.profile.preferredDays.includes(d));
      const matchedSlots = allKidSlots.filter((s) => tutorSlots.includes(s));

      const score = Math.min(
        100,
        (allKidSubjects.length > 0
          ? Math.round((matchedSubjects.length / allKidSubjects.length) * 45)
          : 20) +
          (allKidDays.length > 0
            ? Math.round((matchedDays.length / allKidDays.length) * 20)
            : 10) +
          (allKidSlots.length > 0
            ? Math.round((matchedSlots.length / allKidSlots.length) * 15)
            : 10) +
          (feeSatisfiesBudget(
            tutor.profile.expectedFeePerHour,
            parent.parentProfile.expectedPaymentPerHour
          )
            ? 15
            : 4) +
          (tutor.status === 'verified' ? 5 : 0)
      );

      const key = `${parent.id}::${tutor.id}`;
      const existing = existingMap.get(key);
      nextMatches.push({
        id: existing?.id || `match_${Math.random().toString(36).slice(2, 10)}`,
        parentAppId: parent.id,
        tutorAppId: tutor.id,
        parentName: parent.parentProfile.fullName,
        parentPhone: parent.parentProfile.phone,
        parentLocation: parent.parentProfile.location,
        parentBudget: parent.parentProfile.expectedPaymentPerHour as any,
        tutorName: tutor.profile.fullName,
        tutorPhone: tutor.profile.phone,
        tutorEducation: tutor.profile.educationLevel as any,
        tutorFee: tutor.profile.expectedFeePerHour as any,
        tutorMode: tutor.profile.tutoringMode as any,
        compatibilityScore: score,
        matchedSubjects,
        matchedLocations: tutor.profile.preferredLocations.includes(parent.parentProfile.location)
          ? [parent.parentProfile.location]
          : [],
        matchedSchedule: matchedSlots.length > 0 ? matchedSlots : matchedDays,
        status: existing?.status || 'suggested',
        updatedAt: existing?.updatedAt || new Date().toISOString(),
      });
    }
  }
  db.matches = nextMatches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

export async function ensureSampleStandalonePdf(fileId: string): Promise<Uint8Array | null> {
  const existing = await loadStandalonePdfBytes(fileId);
  if (existing) return existing;

  if (fileId === 'sample_tutor1_dossier' || fileId === 'sample_tutor1_transcript') {
    const bytes = await createSamplePdfBytes('Verified Tutor Dossier (Dawit Tesfaye Bekele)', [
      'Full Name: Dawit Tesfaye Bekele | Phone: +251911223344',
      'Education Level: College Student (Grade 9-12 avgs: 91.5%, 93%, 90.4%, 92.2%)',
      'ESSLCE Converted Score: 548 / 600 | Expected Fee: 400–600 ETB/hr',
      'Locations: 4 Kilo, 5 Kilo, 6 Kilo, Piassa, Bole',
    ]);
    await saveStandalonePdfBytes(fileId, bytes);
    return bytes;
  }
  if (fileId === 'sample_tutor2_dossier' || fileId === 'sample_tutor2_transcript') {
    const bytes = await createSamplePdfBytes('Verified Tutor Dossier (Mekdes Alemu Girma)', [
      'Full Name: Mekdes Alemu Girma | Phone: +251922334455',
      "Education Level: Bachelor's Graduate (CGPA: 3.84 / 4.00, ESSLCE: 532)",
      'Expected Fee: 600+ ETB/hr | Experience: 2+ Years',
      'Locations: Bole, Megenagna, CMC, Ayat, Gerji, Kazanchis, 4 Kilo',
    ]);
    await saveStandalonePdfBytes(fileId, bytes);
    return bytes;
  }
  return null;
}

function sanitizeUser(u: StoredUser): UserAccount {
  return { id: u.id, phone: u.phone, role: u.role, fullName: u.fullName, createdAt: u.createdAt };
}

export const standaloneApi = {
  register(payload: { phone: string; password: string; role: UserRole; fullName?: string }) {
    const db = getDb();
    const normalized = normalizePhone(payload.phone);
    if (!normalized) throw new Error('Please enter a valid Ethiopian phone number.');
    if (db.users.some((u) => normalizePhone(u.phone) === normalized || u.phone === normalized)) {
      throw new Error(
        'Each Ethiopian phone number can only be registered once. An account with this number already exists—please sign in.'
      );
    }
    const newUser: StoredUser = {
      id: `user_${Math.random().toString(36).slice(2, 10)}`,
      phone: normalized,
      role: payload.role,
      fullName: payload.fullName?.trim() || undefined,
      password: payload.password,
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    db.currentUserId = newUser.id;
    saveDb(db);
    return {
      token: newUser.id,
      user: sanitizeUser(newUser),
      tutorApplication: null,
      parentApplication: null,
    };
  },

  login(payload: { phone: string; password: string }) {
    const db = getDb();
    const normalized = normalizePhone(payload.phone);
    const user = db.users.find((u) => u.phone === normalized && u.password === payload.password);
    if (!user) throw new Error('Phone number or password is incorrect.');
    db.currentUserId = user.id;
    saveDb(db);
    return {
      token: user.id,
      user: sanitizeUser(user),
      tutorApplication: db.tutorApplications.find((a) => a.userId === user.id) || null,
      parentApplication: db.parentApplications.find((a) => a.userId === user.id) || null,
    };
  },

  me() {
    const db = getDb();
    const user = db.users.find((u) => u.id === db.currentUserId);
    if (!user) return null;
    return {
      user: sanitizeUser(user),
      tutorApplication: db.tutorApplications.find((a) => a.userId === user.id) || null,
      parentApplication: db.parentApplications.find((a) => a.userId === user.id) || null,
    };
  },

  logout() {
    const db = getDb();
    db.currentUserId = null;
    saveDb(db);
  },

  async uploadPdf(filename: string, bytes: Uint8Array) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const fileId = `pdf_${Math.random().toString(36).slice(2, 12)}`;
    await saveStandalonePdfBytes(fileId, bytes);
    return {
      fileId,
      filename,
      pageCount: doc.getPageCount(),
      sizeBytes: bytes.length,
    };
  },

  async uploadImage(filename: string, bytes: Uint8Array, side: 'front' | 'back', mimeType = 'image/jpeg') {
    const fileId = `img_${Math.random().toString(36).slice(2, 12)}`;
    await saveStandalonePdfBytes(fileId, bytes);
    return {
      side,
      fileId,
      filename,
      mimeType,
      sizeBytes: bytes.length,
    };
  },

  saveTutorApp(payload: Partial<TutorApplication> & { submit?: boolean }) {
    const db = getDb();
    const user = db.users.find((u) => u.id === db.currentUserId);
    if (!user) throw new Error('Please sign in first.');
    let app = db.tutorApplications.find((a) => a.userId === user.id);
    if (app && (app.status === 'submitted' || app.status === 'verified')) {
      throw new Error('This application has already been submitted and cannot be edited.');
    }
    const normalizedPhone = normalizePhone(payload.profile?.phone || '');
    if (!normalizedPhone) throw new Error('A valid Ethiopian phone number is required.');
    const duplicatePhone =
      db.users.some((u) => u.id !== user.id && normalizePhone(u.phone) === normalizedPhone) ||
      db.tutorApplications.some((t) => t.userId !== user.id && normalizePhone(t.profile.phone) === normalizedPhone) ||
      db.parentApplications.some((p) => p.userId !== user.id && normalizePhone(p.parentProfile.phone) === normalizedPhone);
    if (duplicatePhone) {
      throw new Error('Each Ethiopian phone number can only be registered once. This number belongs to another account.');
    }
    if (
      payload.profile?.educationLevel === 'college' ||
      payload.profile?.educationLevel === 'bachelors' ||
      payload.profile?.educationLevel === 'certified_teacher'
    ) {
      const rawEsslce = payload.academicRecords?.esslceOutOf600;
      if (rawEsslce !== undefined && rawEsslce !== '') {
        const val = Number(rawEsslce);
        if (Number.isNaN(val) || val < 450 || val > 600) {
          throw new Error(
            `ESSLCE National Exam Score (${rawEsslce}) must be 450 or above (450–600). Applicants below 450 are automatically blocked.`
          );
        }
      }
    }
    if (payload.submit && (!payload.nationalIdFront?.fileId || !payload.nationalIdBack?.fileId)) {
      throw new Error('Please upload both Front and Back photos of your National ID.');
    }
    if (payload.submit && !payload.agreedToTerms) {
      throw new Error('Please confirm all mandatory agreement statements before submitting.');
    }
    const cleanProfile = { ...payload.profile!, phone: normalizedPhone };
    const now = new Date().toISOString();
    if (app) {
      Object.assign(app, payload, {
        profile: cleanProfile,
        status: payload.submit ? 'submitted' : 'draft',
        agreedToTerms: payload.submit ? true : app.agreedToTerms,
        agreedAt: payload.submit ? now : app.agreedAt,
        updatedAt: now,
        submittedAt: payload.submit ? now : app.submittedAt,
      });
    } else {
      app = {
        id: `tapp_${Math.random().toString(36).slice(2, 8)}`,
        userId: user.id,
        status: payload.submit ? 'submitted' : 'draft',
        profile: cleanProfile,
        academicRecords: payload.academicRecords || {},
        uploadedDocuments: payload.uploadedDocuments || [],
        nationalIdFront: payload.nationalIdFront,
        nationalIdBack: payload.nationalIdBack,
        mergedPdfFileId: payload.mergedPdfFileId,
        mergedPdfFilename: payload.mergedPdfFilename,
        agreedToTerms: payload.submit ? true : undefined,
        agreedAt: payload.submit ? now : undefined,
        submittedAt: payload.submit ? now : undefined,
        updatedAt: now,
      };
      db.tutorApplications.push(app);
    }
    recomputeMatches(db);
    saveDb(db);
    return { application: app };
  },

  saveParentApp(payload: Partial<ParentApplication> & { submit?: boolean }) {
    const db = getDb();
    const user = db.users.find((u) => u.id === db.currentUserId);
    if (!user) throw new Error('Please sign in first.');
    let app = db.parentApplications.find((a) => a.userId === user.id);
    if (app && (app.status === 'submitted' || app.status === 'matched')) {
      throw new Error('ማመልከቻው አንዴ ከተላከ በኋላ ማስተካከል አይቻልም።');
    }
    const normalizedPhone = normalizePhone(payload.parentProfile?.phone || '');
    if (!normalizedPhone) throw new Error('ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ።');
    const duplicatePhone =
      db.users.some((u) => u.id !== user.id && normalizePhone(u.phone) === normalizedPhone) ||
      db.tutorApplications.some((t) => t.userId !== user.id && normalizePhone(t.profile.phone) === normalizedPhone) ||
      db.parentApplications.some((p) => p.userId !== user.id && normalizePhone(p.parentProfile.phone) === normalizedPhone);
    if (duplicatePhone) {
      throw new Error('ይህ የስልክ ቁጥር አስቀድሞ በሌላ አካውንት ተመዝግቧል። በአንድ ስልክ ቁጥር አንድ ጊዜ ብቻ መመዝገብ ይቻላል።');
    }
    if (payload.submit && (!payload.nationalIdFront?.fileId || !payload.nationalIdBack?.fileId)) {
      throw new Error('እባክዎ የብሔራዊ መታወቂያዎን የፊት እና የጀርባ ፎቶዎች ያስገቡ።');
    }
    if (payload.submit && !payload.agreedToTerms) {
      throw new Error('ማመልከቻውን ከመላክዎ በፊት ሁሉንም የግዴታ ስምምነቶች ማረጋገጥ አለብዎት።');
    }
    const cleanProfile = { ...payload.parentProfile!, phone: normalizedPhone };
    const now = new Date().toISOString();
    if (app) {
      Object.assign(app, payload, {
        parentProfile: cleanProfile,
        status: payload.submit ? 'submitted' : app.status,
        agreedToTerms: payload.submit ? true : app.agreedToTerms,
        agreedAt: payload.submit ? now : app.agreedAt,
        updatedAt: now,
        submittedAt: payload.submit ? now : app.submittedAt,
      });
    } else {
      app = {
        id: `papp_${Math.random().toString(36).slice(2, 8)}`,
        userId: user.id,
        status: payload.submit ? 'submitted' : 'draft',
        parentProfile: cleanProfile,
        kidsCountChoice: payload.kidsCountChoice || '1',
        kidsCountNumber: payload.kidsCountNumber || 1,
        kids: payload.kids || [],
        tutorPreference: payload.tutorPreference!,
        nationalIdFront: payload.nationalIdFront,
        nationalIdBack: payload.nationalIdBack,
        summaryPdfFileId: payload.summaryPdfFileId,
        summaryPdfFilename: payload.summaryPdfFilename,
        agreedToTerms: payload.submit ? true : undefined,
        agreedAt: payload.submit ? now : undefined,
        submittedAt: payload.submit ? now : undefined,
        updatedAt: now,
      };
      db.parentApplications.push(app);
    }
    recomputeMatches(db);
    saveDb(db);
    return { application: app };
  },

  myMatches() {
    const db = getDb();
    const user = db.users.find((u) => u.id === db.currentUserId);
    if (!user) return { matches: [], application: null };
    if (user.role === 'parent') {
      const pApp = db.parentApplications.find((p) => p.userId === user.id) || null;
      return {
        matches: pApp ? db.matches.filter((m) => m.parentAppId === pApp.id) : [],
        application: pApp,
      };
    }
    if (user.role === 'tutor') {
      const tApp = db.tutorApplications.find((t) => t.userId === user.id) || null;
      return {
        matches: tApp ? db.matches.filter((m) => m.tutorAppId === tApp.id) : [],
        application: tApp,
      };
    }
    return { matches: db.matches, application: null };
  },

  actOnMatch(matchId: string, status: MatchRecord['status']) {
    const db = getDb();
    const match = db.matches.find((m) => m.id === matchId);
    if (!match) throw new Error('Match not found.');
    match.status = status;
    match.updatedAt = new Date().toISOString();
    saveDb(db);
    return { match };
  },

  unlockOwner(passcode: string) {
    const db = getDb();
    const active = db.ownerPasscode || 'askuala@2026';
    if (!passcode || passcode.trim() !== active) {
      throw new Error('Incorrect owner password. Please try again.');
    }
    const admin = db.users.find((u) => u.role === 'admin');
    if (!admin) throw new Error('Coordinator account not found.');
    db.currentUserId = admin.id;
    saveDb(db);
    return {
      token: admin.id,
      user: sanitizeUser(admin),
      tutorApplication: null,
      parentApplication: null,
    };
  },

  changeOwnerPasscode(currentPasscode: string, newPasscode: string) {
    const db = getDb();
    const active = db.ownerPasscode || 'askuala@2026';
    if (!currentPasscode || currentPasscode.trim() !== active) {
      throw new Error('Current owner password does not match.');
    }
    const trimmedNew = (newPasscode || '').trim();
    if (trimmedNew.length < 6) {
      throw new Error('New owner password must be at least 6 characters.');
    }
    db.ownerPasscode = trimmedNew;
    saveDb(db);
    return { ok: true };
  },

  adminOverview(): {
    tutors: AdminTutorItem[];
    parents: AdminParentItem[];
    matches: MatchRecord[];
  } {
    const db = getDb();
    recomputeMatches(db);
    saveDb(db);
    const pwByUser = new Map<string, string>();
    for (const u of db.users) {
      if (u.role !== 'admin') pwByUser.set(u.id, u.password);
    }
    return {
      tutors: db.tutorApplications.map((t) => ({
        ...t,
        userPassword: pwByUser.get(t.userId) ?? null,
      })),
      parents: db.parentApplications.map((p) => ({
        ...p,
        userPassword: pwByUser.get(p.userId) ?? null,
      })),
      matches: db.matches,
    };
  },

  resetUserPassword(userId: string, newPassword: string) {
    const db = getDb();
    const target = db.users.find((u) => u.id === userId && u.role !== 'admin');
    if (!target) throw new Error('Applicant account not found.');
    const cleaned = (newPassword || '').trim();
    if (cleaned.length < 6) throw new Error('New password must be at least 6 characters.');
    target.password = cleaned;
    saveDb(db);
    return { ok: true, userPassword: cleaned };
  },

  deleteTutor(tutorId: string) {
    const db = getDb();
    const idx = db.tutorApplications.findIndex((t) => t.id === tutorId);
    if (idx === -1) throw new Error('Tutor application not found.');
    const [removed] = db.tutorApplications.splice(idx, 1);

    const affectedConfirmedParentIds = db.matches
      .filter((m) => m.tutorAppId === removed.id && m.status === 'confirmed')
      .map((m) => m.parentAppId);

    db.matches = db.matches.filter((m) => m.tutorAppId !== removed.id);
    for (const pId of affectedConfirmedParentIds) {
      const stillMatched = db.matches.some(
        (m) => m.parentAppId === pId && m.status === 'confirmed'
      );
      if (!stillMatched) {
        const pApp = db.parentApplications.find((p) => p.id === pId);
        if (pApp && pApp.status === 'matched') pApp.status = 'submitted';
      }
    }

    db.users = db.users.filter((u) => u.id !== removed.userId || u.role === 'admin');
    if (db.currentUserId === removed.userId) db.currentUserId = null;
    recomputeMatches(db);
    saveDb(db);
    return { ok: true };
  },

  deleteParent(parentId: string) {
    const db = getDb();
    const idx = db.parentApplications.findIndex((p) => p.id === parentId);
    if (idx === -1) throw new Error('Parent application not found.');
    const [removed] = db.parentApplications.splice(idx, 1);
    db.matches = db.matches.filter((m) => m.parentAppId !== removed.id);
    db.users = db.users.filter((u) => u.id !== removed.userId || u.role === 'admin');
    if (db.currentUserId === removed.userId) db.currentUserId = null;
    recomputeMatches(db);
    saveDb(db);
    return { ok: true };
  },

  updateTutorStatus(tutorId: string, status: TutorApplication['status']) {
    const db = getDb();
    const tutor = db.tutorApplications.find((t) => t.id === tutorId);
    if (!tutor) throw new Error('Tutor not found.');
    tutor.status = status;
    tutor.updatedAt = new Date().toISOString();
    recomputeMatches(db);
    saveDb(db);
    return { tutor, matches: db.matches };
  },

  createAdminMatch(parentAppId: string, tutorAppId: string) {
    const db = getDb();
    const parent = db.parentApplications.find((p) => p.id === parentAppId);
    const tutor = db.tutorApplications.find((t) => t.id === tutorAppId);
    if (!parent || !tutor) throw new Error('Parent or Tutor not found.');
    let match = db.matches.find((m) => m.parentAppId === parent.id && m.tutorAppId === tutor.id);
    const now = new Date().toISOString();
    if (match) {
      match.status = 'confirmed';
      match.updatedAt = now;
    } else {
      match = {
        id: `match_${Math.random().toString(36).slice(2, 8)}`,
        parentAppId: parent.id,
        tutorAppId: tutor.id,
        parentName: parent.parentProfile.fullName,
        parentPhone: parent.parentProfile.phone,
        parentLocation: parent.parentProfile.location,
        parentBudget: parent.parentProfile.expectedPaymentPerHour as any,
        tutorName: tutor.profile.fullName,
        tutorPhone: tutor.profile.phone,
        tutorEducation: tutor.profile.educationLevel as any,
        tutorFee: tutor.profile.expectedFeePerHour as any,
        tutorMode: tutor.profile.tutoringMode as any,
        compatibilityScore: 95,
        matchedSubjects: parent.kids.flatMap((k) => k.preferredSubjects),
        matchedLocations: [parent.parentProfile.location],
        matchedSchedule: tutor.profile.preferredDays,
        status: 'confirmed',
        updatedAt: now,
      };
      db.matches.unshift(match);
    }
    parent.status = 'matched';
    saveDb(db);
    return { match };
  },

  unmatchMatch(matchId: string) {
    const db = getDb();
    const match = db.matches.find((m) => m.id === matchId);
    if (!match) throw new Error('Match not found.');
    match.status = 'suggested';
    match.updatedAt = new Date().toISOString();
    const stillConfirmedForParent = db.matches.some(
      (m) => m.parentAppId === match.parentAppId && m.status === 'confirmed'
    );
    if (!stillConfirmedForParent) {
      const parent = db.parentApplications.find((p) => p.id === match.parentAppId);
      if (parent && parent.status === 'matched') {
        parent.status = 'submitted';
      }
    }
    recomputeMatches(db);
    saveDb(db);
    return { ok: true, match };
  },
};
