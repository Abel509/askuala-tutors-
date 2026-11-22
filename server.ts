import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { build as viteBuild, createServer as createViteServer } from 'vite';
import * as esbuild from 'esbuild';
import type {
  MatchRecord,
  ParentApplication,
  TutorApplication,
  UserAccount,
  UserRole,
} from './src/types/app.js';

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');

let pgPool: pg.Pool | null = null;
function getPgPool(): pg.Pool | null {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: conn,
      ssl: conn.includes('localhost') || conn.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
      max: 5,
    });
    pgPool.on('error', (err) => {
      console.error('Postgres pool warning:', err.message);
    });
  }
  return pgPool;
}

async function ensurePgTables(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS askuala_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS askuala_pdfs (
      file_id TEXT PRIMARY KEY,
      content BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function persistPdfBuffer(fileId: string, buffer: Buffer, ext = 'pdf'): Promise<void> {
  ensureStorageDirs();
  fs.writeFileSync(path.join(UPLOADS_DIR, `${fileId}.${ext}`), buffer);
  const pool = getPgPool();
  if (pool) {
    await pool.query(
      `INSERT INTO askuala_pdfs (file_id, content) VALUES ($1, $2)
       ON CONFLICT (file_id) DO UPDATE SET content = EXCLUDED.content`,
      [fileId, buffer]
    );
  }
}

function detectImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

interface StoredUser extends UserAccount {
  passwordSalt: string;
  passwordHash: string;
  passwordRecoveryEnc?: string;
}

interface SessionEntry {
  token: string;
  userId: string;
  createdAt: string;
}

interface DatabaseSchema {
  ownerPasscode?: string;
  recoveryKey?: string;
  users: StoredUser[];
  sessions: SessionEntry[];
  tutorApplications: TutorApplication[];
  parentApplications: ParentApplication[];
  matches: MatchRecord[];
}

function getRecoveryKeyBuffer(db: DatabaseSchema): Buffer {
  const envKey = process.env.RECOVERY_KEY?.trim();
  let secret = envKey || db.recoveryKey;
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    db.recoveryKey = secret;
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptRecoveryPassword(plain: string, db: DatabaseSchema): string {
  const key = getRecoveryKeyBuffer(db);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptRecoveryPassword(enc: string | undefined, db: DatabaseSchema): string | null {
  if (!enc) return null;
  try {
    const [ivHex, tagHex, dataHex] = enc.split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = getRecoveryKeyBuffer(db);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

async function deleteStoredFileById(fileId?: string): Promise<void> {
  if (!fileId) return;
  const safeId = fileId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return;
  for (const ext of ['pdf', 'jpg', 'png', 'webp']) {
    const resolved = path.resolve(UPLOADS_DIR, `${safeId}.${ext}`);
    if (resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep) && fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch {
        // ignore file unlink error
      }
    }
  }
  const pool = getPgPool();
  if (pool) {
    await pool.query(`DELETE FROM askuala_pdfs WHERE file_id = $1`, [safeId]).catch(() => {});
  }
}

function ensureStorageDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash };
}

function normalizeEthiopianPhone(raw: string): string | null {
  const cleaned = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^\+251[97]\d{8}$/.test(cleaned)) return cleaned;
  if (/^251[97]\d{8}$/.test(cleaned)) return '+' + cleaned;
  if (/^0[97]\d{8}$/.test(cleaned)) return '+251' + cleaned.slice(1);
  return null;
}

async function createSamplePdfFile(fileId: string, title: string, lines: string[]): Promise<number> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  page.drawRectangle({
    x: 40,
    y: 740,
    width: 515,
    height: 60,
    color: rgb(0.067, 0.176, 0.122),
  });

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
    page.drawText(line, {
      x: 56,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0.07, 0.13, 0.09),
    });
    y -= 24;
  }

  const bytes = await pdfDoc.save();
  await persistPdfBuffer(fileId, Buffer.from(bytes));
  return pdfDoc.getPageCount();
}

async function initDatabase(): Promise<DatabaseSchema> {
  ensureStorageDirs();
  const pool = getPgPool();
  if (pool) {
    try {
      await ensurePgTables(pool);
      const result = await pool.query<{ payload: DatabaseSchema }>(
        `SELECT payload FROM askuala_state WHERE id = 'main' LIMIT 1`
      );
      if (result.rows[0]?.payload) {
        const remoteDb = result.rows[0].payload;
        fs.writeFileSync(DB_PATH, JSON.stringify(remoteDb, null, 2), 'utf-8');
        return remoteDb;
      }
    } catch (err) {
      console.error('Postgres init warning (falling back to local JSON if needed):', err);
    }
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseSchema;
      if (pool) {
        await pool.query(
          `INSERT INTO askuala_state (id, payload) VALUES ('main', $1::jsonb)
           ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [JSON.stringify(parsed)]
        );
      }
      return parsed;
    } catch {
      // fall through to initialize
    }
  }

  const now = new Date().toISOString();
  const adminPw = hashPassword('Askuala#1');
  const sampleTutor1Pw = hashPassword('Tutor#89A');
  const sampleTutor2Pw = hashPassword('Tutor#92B');
  const sampleParent1Pw = hashPassword('Parent#88');

  const doc1Id = 'sample_tutor1_transcript';
  const doc2Id = 'sample_tutor2_transcript';
  const merged1Id = 'sample_tutor1_dossier';
  const merged2Id = 'sample_tutor2_dossier';

  const pCount1 = await createSamplePdfFile(doc1Id, 'Addis Ababa University - Official Transcript & ESSLCE', [
    'Applicant: Dawit Tesfaye Bekele',
    'Education Level: College Student (Computer Science, Year 3)',
    'Grade 9 Average: 91.5%',
    'Grade 10 Average: 93.0%',
    'Grade 11 Average: 90.4%',
    'Grade 12 Average: 92.2%',
    'ESSLCE Converted Score (out of 600): 548 / 600',
  ]);

  const pCount2 = await createSamplePdfFile(doc2Id, "Bachelor's Degree CGPA & ESSLCE Record", [
    'Applicant: Mekdes Alemu Girma',
    "Education Level: Bachelor's Graduate (Applied Mathematics, AAU)",
    'Graduation CGPA: 3.84 / 4.00',
    'ESSLCE Score: 532 / 600',
    'Verified Teaching Experience: 2+ Years',
  ]);

  await createSamplePdfFile(merged1Id, 'Askuala Tutors - Verified Tutor Dossier (Dawit Tesfaye)', [
    'Full Name: Dawit Tesfaye Bekele',
    'Phone: +251911223344 | Sex: Male',
    'Locations: 4 Kilo, 5 Kilo, 6 Kilo, Piassa, Bole',
    'Subjects: Mathematics, Physics, Chemistry, ICT, Entrance Exam Preparation',
    'Expected Fee: 400–600 ETB / hour',
    'Status: Verified by Coordinator',
  ]);

  await createSamplePdfFile(merged2Id, 'Askuala Tutors - Verified Tutor Dossier (Mekdes Alemu)', [
    'Full Name: Mekdes Alemu Girma',
    'Phone: +251922334455 | Sex: Female',
    'Locations: Bole, Megenagna, CMC, Ayat, Gerji, Kazanchis',
    'Subjects: Mathematics, Biology, Chemistry, English, Spoken English, Entrance Exam Preparation',
    'Expected Fee: 600+ ETB / hour',
    'Status: Verified by Coordinator',
  ]);

  const initial: DatabaseSchema = {
    ownerPasscode: 'askuala@2026',
    recoveryKey: crypto.randomBytes(32).toString('hex'),
    users: [
      {
        id: 'user_admin_1',
        phone: '+251911000000',
        role: 'admin',
        fullName: 'Askuala Coordinator',
        passwordSalt: adminPw.salt,
        passwordHash: adminPw.hash,
        createdAt: now,
      },
      {
        id: 'user_tutor_1',
        phone: '+251911223344',
        role: 'tutor',
        fullName: 'Dawit Tesfaye Bekele',
        passwordSalt: sampleTutor1Pw.salt,
        passwordHash: sampleTutor1Pw.hash,
        createdAt: now,
      },
      {
        id: 'user_tutor_2',
        phone: '+251922334455',
        role: 'tutor',
        fullName: 'Mekdes Alemu Girma',
        passwordSalt: sampleTutor2Pw.salt,
        passwordHash: sampleTutor2Pw.hash,
        createdAt: now,
      },
      {
        id: 'user_parent_1',
        phone: '+251933445566',
        role: 'parent',
        fullName: 'አቶ ታደሰ ገብረማርያም',
        passwordSalt: sampleParent1Pw.salt,
        passwordHash: sampleParent1Pw.hash,
        createdAt: now,
      },
    ],
    sessions: [],
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
            fileId: doc1Id,
            filename: 'Dawit_Grades_9_12_Transcript.pdf',
            pageCount: pCount1,
            sizeBytes: 4200,
          },
        ],
        mergedPdfFileId: merged1Id,
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
            fileId: doc2Id,
            filename: 'Mekdes_Degree_CGPA_Transcript.pdf',
            pageCount: pCount2,
            sizeBytes: 3900,
          },
        ],
        mergedPdfFileId: merged2Id,
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
        tutorPreference: {
          sex: 'any',
          mode: 'in_person',
        },
        submittedAt: now,
        updatedAt: now,
      },
    ],
    matches: [],
  };

  initial.users[1].passwordRecoveryEnc = encryptRecoveryPassword('Tutor#89A', initial);
  initial.users[2].passwordRecoveryEnc = encryptRecoveryPassword('Tutor#92B', initial);
  initial.users[3].passwordRecoveryEnc = encryptRecoveryPassword('Parent#88', initial);

  recomputeAllMatches(initial);
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db: DatabaseSchema) {
  ensureStorageDirs();
  const serialized = JSON.stringify(db, null, 2);
  fs.writeFileSync(DB_PATH, serialized, 'utf-8');
  const pool = getPgPool();
  if (pool) {
    pool
      .query(
        `INSERT INTO askuala_state (id, payload) VALUES ('main', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [serialized]
      )
      .catch((err) => {
        console.error('Failed to persist state to Postgres:', err);
      });
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

function recomputeAllMatches(db: DatabaseSchema) {
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
    const allKidSubjects = Array.from(
      new Set(parent.kids.flatMap((k) => k.preferredSubjects))
    );
    const allKidDays = Array.from(new Set(parent.kids.flatMap((k) => k.selectedDays)));
    const allKidSlots = Array.from(
      new Set(parent.kids.flatMap((k) => [...k.weekdaySlots, ...k.weekendSlots]))
    );

    for (const tutor of activeTutors) {
      // Mode compatibility
      const modeOk =
        tutor.profile.tutoringMode === 'both' ||
        tutor.profile.tutoringMode === parent.tutorPreference.mode;
      if (!modeOk) continue;

      // Sex preference compatibility
      const sexOk =
        !parent.tutorPreference.sex ||
        parent.tutorPreference.sex === 'any' ||
        parent.tutorPreference.sex === tutor.profile.sex;
      if (!sexOk) continue;

      // Location compatibility for in-person
      const locationMatched =
        parent.tutorPreference.mode === 'online'
          ? true
          : tutor.profile.preferredLocations.includes(parent.parentProfile.location);

      const matchedLocations = tutor.profile.preferredLocations.includes(
        parent.parentProfile.location
      )
        ? [parent.parentProfile.location]
        : [];

      if (parent.tutorPreference.mode === 'in_person' && !locationMatched) {
        continue;
      }

      const matchedSubjects = allKidSubjects.filter((s) =>
        tutor.profile.preferredSubjects.includes(s)
      );
      if (matchedSubjects.length === 0) continue;

      const tutorAllSlots = [
        ...tutor.profile.weekdaySlots,
        ...tutor.profile.weekendSlots,
      ];
      const matchedDays = allKidDays.filter((d) =>
        tutor.profile.preferredDays.includes(d)
      );
      const matchedSlots = allKidSlots.filter((s) => tutorAllSlots.includes(s));

      const subjectScore =
        allKidSubjects.length > 0
          ? Math.round((matchedSubjects.length / allKidSubjects.length) * 45)
          : 20;
      const dayScore =
        allKidDays.length > 0
          ? Math.round((matchedDays.length / allKidDays.length) * 20)
          : 10;
      const slotScore =
        allKidSlots.length > 0
          ? Math.round((matchedSlots.length / allKidSlots.length) * 15)
          : 10;
      const feeScore = feeSatisfiesBudget(
        tutor.profile.expectedFeePerHour,
        parent.parentProfile.expectedPaymentPerHour
      )
        ? 15
        : 4;
      const verifiedBonus = tutor.status === 'verified' ? 5 : 0;

      const score = Math.min(100, subjectScore + dayScore + slotScore + feeScore + verifiedBonus);
      const key = `${parent.id}::${tutor.id}`;
      const existing = existingMap.get(key);

      nextMatches.push({
        id: existing?.id || `match_${crypto.randomUUID().slice(0, 8)}`,
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
        matchedLocations,
        matchedSchedule: matchedSlots.length > 0 ? matchedSlots : matchedDays,
        status: existing?.status || 'suggested',
        updatedAt: existing?.updatedAt || new Date().toISOString(),
      });
    }
  }

  db.matches = nextMatches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

function validateTutorEligibility(
  profile: TutorApplication['profile'],
  academicRecords: TutorApplication['academicRecords']
): { eligible: boolean; reason?: string } {
  if (!profile.educationLevel || profile.educationLevel === 'below_11') {
    return {
      eligible: false,
      reason: 'Applicants below Grade 11 are automatically ineligible to tutor on Askuala Tutors.',
    };
  }

  const gradeFields: Array<{ key: keyof TutorApplication['academicRecords']; label: string }> = [];
  if (profile.educationLevel === 'grade_11') {
    gradeFields.push(
      { key: 'grade9Avg', label: 'Grade 9 average' },
      { key: 'grade10Avg', label: 'Grade 10 average' }
    );
  } else if (profile.educationLevel === 'grade_12') {
    gradeFields.push(
      { key: 'grade9Avg', label: 'Grade 9 average' },
      { key: 'grade10Avg', label: 'Grade 10 average' },
      { key: 'grade11Avg', label: 'Grade 11 average' }
    );
  } else if (profile.educationLevel === 'college') {
    gradeFields.push(
      { key: 'grade9Avg', label: 'Grade 9 average' },
      { key: 'grade10Avg', label: 'Grade 10 average' },
      { key: 'grade11Avg', label: 'Grade 11 average' },
      { key: 'grade12Avg', label: 'Grade 12 average' }
    );
  }

  for (const field of gradeFields) {
    const raw = academicRecords[field.key];
    if (raw !== undefined && raw !== '') {
      const val = Number(raw);
      if (Number.isNaN(val) || val < 87 || val > 100) {
        return {
          eligible: false,
          reason: `${field.label} (${raw}) must be 87 or above. Applicants below 87% are automatically blocked.`,
        };
      }
    }
  }

  if (
    profile.educationLevel === 'college' ||
    profile.educationLevel === 'bachelors' ||
    profile.educationLevel === 'certified_teacher'
  ) {
    const rawEsslce = academicRecords.esslceOutOf600;
    if (rawEsslce !== undefined && rawEsslce !== '') {
      const esslceVal = Number(rawEsslce);
      if (Number.isNaN(esslceVal) || esslceVal < 450 || esslceVal > 600) {
        return {
          eligible: false,
          reason: `ESSLCE National Exam Score (${rawEsslce}) must be 450 or above (450–600). Applicants below 450 are automatically blocked.`,
        };
      }
    }
  }

  return { eligible: true };
}

async function startServer() {
  const db = await initDatabase();
  const app = express();
  app.use(express.json({ limit: '45mb' }));

  const getUserFromReq = (req: express.Request): StoredUser | null => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return null;
    const session = db.sessions.find((s) => s.token === token);
    if (!session) return null;
    return db.users.find((u) => u.id === session.userId) || null;
  };

  const sanitizeUser = (u: StoredUser): UserAccount => ({
    id: u.id,
    phone: u.phone,
    role: u.role,
    fullName: u.fullName,
    createdAt: u.createdAt,
  });

  // Register account with Ethiopian phone + >=8 char strong password
  app.post('/api/auth/register', (req, res) => {
    const { phone, password, role, fullName } = req.body as {
      phone?: string;
      password?: string;
      role?: UserRole;
      fullName?: string;
    };

    const normalized = normalizeEthiopianPhone(phone || '');
    if (!normalized) {
      return res.status(400).json({
        error: 'Please enter a valid Ethiopian phone number (e.g. +251 9XX XXX XXX or 09XXXXXXXX).',
      });
    }

    if (
      !password ||
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return res.status(400).json({
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.',
      });
    }

    if (role !== 'tutor' && role !== 'parent') {
      return res.status(400).json({ error: 'Account role must be tutor or parent.' });
    }

    const existing = db.users.find((u) => normalizeEthiopianPhone(u.phone) === normalized || u.phone === normalized);
    if (existing) {
      return res.status(409).json({
        error:
          'Each Ethiopian phone number can only be registered once. An account with this number already exists—please sign in.',
      });
    }

    const { salt, hash } = hashPassword(password);
    const newUser: StoredUser = {
      id: `user_${crypto.randomUUID().slice(0, 10)}`,
      phone: normalized,
      role,
      fullName: fullName?.trim() || undefined,
      passwordSalt: salt,
      passwordHash: hash,
      passwordRecoveryEnc: encryptRecoveryPassword(password, db),
      createdAt: new Date().toISOString(),
    };

    const token = crypto.randomBytes(24).toString('hex');
    db.users.push(newUser);
    db.sessions.push({ token, userId: newUser.id, createdAt: new Date().toISOString() });
    saveDatabase(db);

    return res.json({
      token,
      user: sanitizeUser(newUser),
      tutorApplication: null,
      parentApplication: null,
    });
  });

  // Sign in
  app.post('/api/auth/login', (req, res) => {
    const { phone, password } = req.body as { phone?: string; password?: string };
    const normalized = normalizeEthiopianPhone(phone || '');
    if (!normalized || !password) {
      return res.status(400).json({ error: 'Valid Ethiopian phone number and password are required.' });
    }

    const user = db.users.find((u) => u.phone === normalized);
    if (!user) {
      return res.status(401).json({ error: 'Phone number or password is incorrect.' });
    }

    const { hash } = hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) {
      return res.status(401).json({ error: 'Phone number or password is incorrect.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    saveDatabase(db);

    const tutorApplication = db.tutorApplications.find((a) => a.userId === user.id) || null;
    const parentApplication = db.parentApplications.find((a) => a.userId === user.id) || null;

    return res.json({
      token,
      user: sanitizeUser(user),
      tutorApplication,
      parentApplication,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const tutorApplication = db.tutorApplications.find((a) => a.userId === user.id) || null;
    const parentApplication = db.parentApplications.find((a) => a.userId === user.id) || null;
    return res.json({
      user: sanitizeUser(user),
      tutorApplication,
      parentApplication,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (token) {
      db.sessions = db.sessions.filter((s) => s.token !== token);
      saveDatabase(db);
    }
    return res.json({ ok: true });
  });

  // Upload PDF document (raw base64)
  app.post('/api/uploads/pdf', async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { filename, base64Data } = req.body as { filename?: string; base64Data?: string };
    if (!base64Data) {
      return res.status(400).json({ error: 'No PDF payload provided.' });
    }

    try {
      const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(cleaned, 'base64');
      if (buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
        return res.status(400).json({ error: 'Only valid PDF documents are accepted.' });
      }
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();

      const fileId = `pdf_${crypto.randomUUID().slice(0, 12)}`;
      await persistPdfBuffer(fileId, buffer);

      return res.json({
        fileId,
        filename: filename || `${fileId}.pdf`,
        pageCount,
        sizeBytes: buffer.length,
      });
    } catch {
      return res.status(400).json({ error: 'Failed to parse PDF document. Ensure it is an uncorrupted PDF.' });
    }
  });

  // Serve stored PDF (from disk cache or Postgres cloud backup)
  app.get('/api/uploads/pdf/:fileId', async (req, res) => {
    const safeId = req.params.fileId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(UPLOADS_DIR, `${safeId}.pdf`);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeId}.pdf"`);
      return fs.createReadStream(filePath).pipe(res);
    }

    const pool = getPgPool();
    if (pool) {
      try {
        const result = await pool.query<{ content: Buffer }>(
          `SELECT content FROM askuala_pdfs WHERE file_id = $1 LIMIT 1`,
          [safeId]
        );
        const buf = result.rows[0]?.content;
        if (buf) {
          ensureStorageDirs();
          fs.writeFileSync(filePath, buf);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${safeId}.pdf"`);
          return res.send(buf);
        }
      } catch (err) {
        console.error('Postgres PDF lookup failed:', err);
      }
    }

    return res.status(404).json({ error: 'PDF document not found.' });
  });

  // Upload National ID image (JPEG / PNG / WEBP)
  app.post('/api/uploads/image', async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { filename, base64Data, side } = req.body as {
      filename?: string;
      base64Data?: string;
      side?: 'front' | 'back';
    };
    if (!base64Data) {
      return res.status(400).json({ error: 'No image payload provided.' });
    }

    try {
      const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(cleaned, 'base64');
      const mimeType = detectImageMime(buffer);
      if (!mimeType) {
        return res.status(400).json({ error: 'Only valid JPG, PNG, or WEBP photos are accepted.' });
      }
      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const fileId = `img_${crypto.randomUUID().slice(0, 12)}`;
      await persistPdfBuffer(fileId, buffer, ext);

      return res.json({
        side: side === 'back' ? 'back' : 'front',
        fileId,
        filename: filename || `${fileId}.${ext}`,
        mimeType,
        sizeBytes: buffer.length,
      });
    } catch {
      return res.status(400).json({ error: 'Failed to process uploaded photo.' });
    }
  });

  // Serve stored National ID image
  app.get('/api/uploads/image/:fileId', async (req, res) => {
    const safeId = req.params.fileId.replace(/[^a-zA-Z0-9_-]/g, '');
    for (const [ext, mime] of [
      ['jpg', 'image/jpeg'],
      ['png', 'image/png'],
      ['webp', 'image/webp'],
    ] as const) {
      const filePath = path.join(UPLOADS_DIR, `${safeId}.${ext}`);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', mime);
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    const pool = getPgPool();
    if (pool) {
      try {
        const result = await pool.query<{ content: Buffer }>(
          `SELECT content FROM askuala_pdfs WHERE file_id = $1 LIMIT 1`,
          [safeId]
        );
        const buf = result.rows[0]?.content;
        if (buf) {
          const mime = detectImageMime(buf) || 'image/jpeg';
          const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
          ensureStorageDirs();
          fs.writeFileSync(path.join(UPLOADS_DIR, `${safeId}.${ext}`), buf);
          res.setHeader('Content-Type', mime);
          return res.send(buf);
        }
      } catch (err) {
        console.error('Postgres image lookup failed:', err);
      }
    }

    return res.status(404).json({ error: 'Image not found.' });
  });

  // Save or Submit Tutor Application
  app.post('/api/tutor/application', (req, res) => {
    const user = getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: 'Please sign in first.' });
    }
    if (user.role !== 'tutor' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only tutor accounts can submit tutor applications.' });
    }

    const {
      profile,
      academicRecords,
      uploadedDocuments,
      nationalIdFront,
      nationalIdBack,
      mergedPdfFileId,
      mergedPdfFilename,
      agreedToTerms,
      submit,
    } = req.body as Partial<TutorApplication> & { submit?: boolean };

    if (!profile || !academicRecords) {
      return res.status(400).json({ error: 'Incomplete application payload.' });
    }

    const existingLocked = db.tutorApplications.find((a) => a.userId === user.id);
    if (
      existingLocked &&
      (existingLocked.status === 'submitted' || existingLocked.status === 'verified')
    ) {
      return res.status(403).json({
        error: 'This application has already been submitted and cannot be edited.',
      });
    }

    const normalizedPhone = normalizeEthiopianPhone(profile.phone || '');
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'A valid Ethiopian phone number is required.' });
    }
    const phoneUsedElsewhere =
      db.users.some((u) => u.id !== user.id && normalizeEthiopianPhone(u.phone) === normalizedPhone) ||
      db.tutorApplications.some(
        (t) => t.userId !== user.id && normalizeEthiopianPhone(t.profile.phone) === normalizedPhone
      ) ||
      db.parentApplications.some(
        (p) => p.userId !== user.id && normalizeEthiopianPhone(p.parentProfile.phone) === normalizedPhone
      );
    if (phoneUsedElsewhere) {
      return res.status(409).json({
        error: 'Each Ethiopian phone number can only be registered once. This phone number already belongs to another account.',
      });
    }
    const cleanProfile = { ...profile, phone: normalizedPhone };

    if (submit && (!nationalIdFront?.fileId || !nationalIdBack?.fileId)) {
      return res.status(400).json({
        error: 'Please upload photos of both the Front Side and Back Side of your National ID.',
      });
    }

    if (submit && !agreedToTerms) {
      return res.status(400).json({
        error: 'Please check all mandatory agreement statements before submitting your application.',
      });
    }

    const eligibility = validateTutorEligibility(cleanProfile, academicRecords);
    const now = new Date().toISOString();

    let status: TutorApplication['status'] = submit ? 'submitted' : 'draft';
    if (!eligibility.eligible) {
      status = 'blocked';
    }

    if (submit && !eligibility.eligible) {
      return res.status(422).json({
        error: eligibility.reason || 'Applicant does not meet eligibility criteria.',
        status: 'blocked',
      });
    }

    let existing = existingLocked;
    if (existing) {
      existing.profile = cleanProfile;
      existing.academicRecords = academicRecords;
      existing.uploadedDocuments = uploadedDocuments || [];
      if (nationalIdFront !== undefined) existing.nationalIdFront = nationalIdFront;
      if (nationalIdBack !== undefined) existing.nationalIdBack = nationalIdBack;
      existing.mergedPdfFileId = mergedPdfFileId || existing.mergedPdfFileId;
      existing.mergedPdfFilename = mergedPdfFilename || existing.mergedPdfFilename;
      existing.status = status;
      existing.blockReason = eligibility.reason;
      existing.updatedAt = now;
      if (submit) {
        existing.agreedToTerms = true;
        existing.agreedAt = now;
        existing.submittedAt = now;
      }
    } else {
      existing = {
        id: `tapp_${crypto.randomUUID().slice(0, 8)}`,
        userId: user.id,
        status,
        blockReason: eligibility.reason,
        profile: cleanProfile,
        academicRecords,
        uploadedDocuments: uploadedDocuments || [],
        nationalIdFront,
        nationalIdBack,
        mergedPdfFileId,
        mergedPdfFilename,
        agreedToTerms: submit ? true : undefined,
        agreedAt: submit ? now : undefined,
        submittedAt: submit ? now : undefined,
        updatedAt: now,
      };
      db.tutorApplications.push(existing);
    }

    if (cleanProfile.fullName) {
      user.fullName = cleanProfile.fullName;
    }

    recomputeAllMatches(db);
    saveDatabase(db);

    return res.json({ application: existing });
  });

  // Save or Submit Parent Application
  app.post('/api/parent/application', (req, res) => {
    const user = getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: 'Please sign in first.' });
    }
    if (user.role !== 'parent' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only parent accounts can submit parent applications.' });
    }

    const {
      parentProfile,
      kidsCountChoice,
      kidsCountNumber,
      kids,
      tutorPreference,
      nationalIdFront,
      nationalIdBack,
      summaryPdfFileId,
      summaryPdfFilename,
      agreedToTerms,
      submit,
    } = req.body as Partial<ParentApplication> & { submit?: boolean };

    if (!parentProfile || !kids || !tutorPreference) {
      return res.status(400).json({ error: 'Incomplete parent application payload.' });
    }

    const existingLocked = db.parentApplications.find((a) => a.userId === user.id);
    if (
      existingLocked &&
      (existingLocked.status === 'submitted' || existingLocked.status === 'matched')
    ) {
      return res.status(403).json({
        error: 'ማመልከቻው አንዴ ከተላከ በኋላ ማስተካከል አይቻልም።',
      });
    }

    const normalizedPhone = normalizeEthiopianPhone(parentProfile.phone || '');
    if (!normalizedPhone) {
      return res.status(400).json({
        error: 'ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ።',
      });
    }
    const phoneUsedElsewhere =
      db.users.some((u) => u.id !== user.id && normalizeEthiopianPhone(u.phone) === normalizedPhone) ||
      db.tutorApplications.some(
        (t) => t.userId !== user.id && normalizeEthiopianPhone(t.profile.phone) === normalizedPhone
      ) ||
      db.parentApplications.some(
        (p) => p.userId !== user.id && normalizeEthiopianPhone(p.parentProfile.phone) === normalizedPhone
      );
    if (phoneUsedElsewhere) {
      return res.status(409).json({
        error: 'ይህ የስልክ ቁጥር አስቀድሞ በሌላ አካውንት ተመዝግቧል። በአንድ ስልክ ቁጥር አንድ ጊዜ ብቻ መመዝገብ ይቻላል።',
      });
    }
    const cleanParentProfile = { ...parentProfile, phone: normalizedPhone };

    if (submit && (!nationalIdFront?.fileId || !nationalIdBack?.fileId)) {
      return res.status(400).json({
        error: 'እባክዎ የብሔራዊ መታወቂያዎን የፊት እና የጀርባ ፎቶዎች ያስገቡ።',
      });
    }

    if (submit && !agreedToTerms) {
      return res.status(400).json({
        error: 'ማመልከቻውን ከመላክዎ በፊት ሁሉንም የግዴታ ስምምነቶች ማረጋገጥ አለብዎት።',
      });
    }

    const now = new Date().toISOString();
    let existing = existingLocked;
    if (existing) {
      existing.parentProfile = cleanParentProfile;
      existing.kidsCountChoice = kidsCountChoice || '1';
      existing.kidsCountNumber = kidsCountNumber || kids.length;
      existing.kids = kids;
      existing.tutorPreference = tutorPreference;
      if (nationalIdFront !== undefined) existing.nationalIdFront = nationalIdFront;
      if (nationalIdBack !== undefined) existing.nationalIdBack = nationalIdBack;
      existing.summaryPdfFileId = summaryPdfFileId || existing.summaryPdfFileId;
      existing.summaryPdfFilename = summaryPdfFilename || existing.summaryPdfFilename;
      existing.status = submit ? 'submitted' : existing.status;
      existing.updatedAt = now;
      if (submit) {
        existing.agreedToTerms = true;
        existing.agreedAt = now;
        existing.submittedAt = now;
      }
    } else {
      existing = {
        id: `papp_${crypto.randomUUID().slice(0, 8)}`,
        userId: user.id,
        status: submit ? 'submitted' : 'draft',
        parentProfile: cleanParentProfile,
        kidsCountChoice: kidsCountChoice || '1',
        kidsCountNumber: kidsCountNumber || kids.length,
        kids,
        tutorPreference,
        nationalIdFront,
        nationalIdBack,
        summaryPdfFileId,
        summaryPdfFilename,
        agreedToTerms: submit ? true : undefined,
        agreedAt: submit ? now : undefined,
        submittedAt: submit ? now : undefined,
        updatedAt: now,
      };
      db.parentApplications.push(existing);
    }

    if (cleanParentProfile.fullName) {
      user.fullName = cleanParentProfile.fullName;
    }

    recomputeAllMatches(db);
    saveDatabase(db);

    return res.json({ application: existing });
  });

  // Get matches for logged-in parent or tutor
  app.get('/api/matches/mine', (req, res) => {
    const user = getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (user.role === 'parent') {
      const pApp = db.parentApplications.find((p) => p.userId === user.id);
      if (!pApp) return res.json({ matches: [], application: null });
      const matches = db.matches
        .filter((m) => m.parentAppId === pApp.id)
        .map((m) => {
          const tutorApp = db.tutorApplications.find((t) => t.id === m.tutorAppId);
          return {
            ...m,
            tutorVerified: tutorApp?.status === 'verified',
            tutorExperience: tutorApp?.profile.priorExperience,
            tutorSex: tutorApp?.profile.sex,
          };
        });
      return res.json({ matches, application: pApp });
    }

    if (user.role === 'tutor') {
      const tApp = db.tutorApplications.find((t) => t.userId === user.id);
      if (!tApp) return res.json({ matches: [], application: null });
      const matches = db.matches
        .filter((m) => m.tutorAppId === tApp.id)
        .map((m) => {
          const parentApp = db.parentApplications.find((p) => p.id === m.parentAppId);
          return {
            ...m,
            kidsCount: parentApp?.kids.length || 1,
            kidsGrades: parentApp?.kids.map((k) => k.gradeLevel) || [],
          };
        });
      return res.json({ matches, application: tApp });
    }

    return res.json({ matches: db.matches, application: null });
  });

  // Match action (request, confirm, decline)
  app.post('/api/matches/:matchId/action', (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { status } = req.body as { status?: MatchRecord['status'] };
    const match = db.matches.find((m) => m.id === req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    if (status && ['suggested', 'requested', 'confirmed', 'declined'].includes(status)) {
      match.status = status;
      match.updatedAt = new Date().toISOString();
      if (status === 'confirmed') {
        const pApp = db.parentApplications.find((p) => p.id === match.parentAppId);
        if (pApp) pApp.status = 'matched';
      }
      saveDatabase(db);
    }
    return res.json({ match });
  });

  // Owner passcode unlock (defaults to askuala@2026 and editable by owner)
  app.post('/api/admin/unlock', (req, res) => {
    const { passcode } = req.body as { passcode?: string };
    const currentPasscode = db.ownerPasscode || 'askuala@2026';
    if (!passcode || passcode.trim() !== currentPasscode) {
      return res.status(401).json({ error: 'Incorrect owner password. Please try again.' });
    }
    const adminUser = db.users.find((u) => u.role === 'admin');
    if (!adminUser) {
      return res.status(500).json({ error: 'Coordinator account not initialized.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions.push({ token, userId: adminUser.id, createdAt: new Date().toISOString() });
    saveDatabase(db);
    return res.json({
      token,
      user: sanitizeUser(adminUser),
      tutorApplication: null,
      parentApplication: null,
    });
  });

  // Owner password update
  app.post('/api/admin/change-passcode', (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const { currentPasscode, newPasscode } = req.body as {
      currentPasscode?: string;
      newPasscode?: string;
    };
    const activePasscode = db.ownerPasscode || 'askuala@2026';
    if (!currentPasscode || currentPasscode.trim() !== activePasscode) {
      return res.status(400).json({ error: 'Current owner password does not match.' });
    }
    const trimmedNew = (newPasscode || '').trim();
    if (trimmedNew.length < 6) {
      return res.status(400).json({ error: 'New owner password must be at least 6 characters.' });
    }
    db.ownerPasscode = trimmedNew;
    saveDatabase(db);
    return res.json({ ok: true });
  });

  // Admin overview (includes owner-only decrypted recovery passwords)
  app.get('/api/admin/overview', (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    recomputeAllMatches(db);
    saveDatabase(db);

    const passwordByUserId = new Map<string, string | null>();
    for (const u of db.users) {
      if (u.role !== 'admin') {
        passwordByUserId.set(u.id, decryptRecoveryPassword(u.passwordRecoveryEnc, db));
      }
    }

    return res.json({
      tutors: db.tutorApplications.map((t) => ({
        ...t,
        userPassword: passwordByUserId.get(t.userId) ?? null,
      })),
      parents: db.parentApplications.map((p) => ({
        ...p,
        userPassword: passwordByUserId.get(p.userId) ?? null,
      })),
      matches: db.matches,
    });
  });

  // Owner resets/sets an applicant's password
  app.post('/api/admin/users/:userId/reset-password', (req, res) => {
    const admin = getUserFromReq(req);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const target = db.users.find((u) => u.id === req.params.userId && u.role !== 'admin');
    if (!target) {
      return res.status(404).json({ error: 'Applicant account not found.' });
    }
    const { newPassword } = req.body as { newPassword?: string };
    const cleaned = (newPassword || '').trim();
    if (cleaned.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const { salt, hash } = hashPassword(cleaned);
    target.passwordSalt = salt;
    target.passwordHash = hash;
    target.passwordRecoveryEnc = encryptRecoveryPassword(cleaned, db);
    saveDatabase(db);
    return res.json({ ok: true, userPassword: cleaned });
  });

  // Permanent Tutor removal
  app.delete('/api/admin/tutors/:tutorId', async (req, res) => {
    const admin = getUserFromReq(req);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const idx = db.tutorApplications.findIndex((t) => t.id === req.params.tutorId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Tutor application not found.' });
    }
    const [removed] = db.tutorApplications.splice(idx, 1);

    const fileIds = [
      ...removed.uploadedDocuments.map((d) => d.fileId),
      removed.nationalIdFront?.fileId,
      removed.nationalIdBack?.fileId,
      removed.mergedPdfFileId,
    ];
    for (const fid of fileIds) {
      await deleteStoredFileById(fid);
    }

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
    db.sessions = db.sessions.filter((s) => s.userId !== removed.userId);
    recomputeAllMatches(db);
    saveDatabase(db);
    return res.json({ ok: true });
  });

  // Permanent Parent removal
  app.delete('/api/admin/parents/:parentId', async (req, res) => {
    const admin = getUserFromReq(req);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const idx = db.parentApplications.findIndex((p) => p.id === req.params.parentId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Parent application not found.' });
    }
    const [removed] = db.parentApplications.splice(idx, 1);

    for (const fid of [
      removed.nationalIdFront?.fileId,
      removed.nationalIdBack?.fileId,
      removed.summaryPdfFileId,
    ]) {
      await deleteStoredFileById(fid);
    }

    db.matches = db.matches.filter((m) => m.parentAppId !== removed.id);
    db.users = db.users.filter((u) => u.id !== removed.userId || u.role === 'admin');
    db.sessions = db.sessions.filter((s) => s.userId !== removed.userId);
    recomputeAllMatches(db);
    saveDatabase(db);
    return res.json({ ok: true });
  });

  // Admin verify/reject tutor
  app.post('/api/admin/tutors/:tutorId/status', (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const { status } = req.body as { status?: TutorApplication['status'] };
    const tutor = db.tutorApplications.find((t) => t.id === req.params.tutorId);
    if (!tutor) return res.status(404).json({ error: 'Tutor application not found.' });

    if (status && ['submitted', 'verified', 'rejected', 'blocked'].includes(status)) {
      tutor.status = status;
      tutor.updatedAt = new Date().toISOString();
      recomputeAllMatches(db);
      saveDatabase(db);
    }
    return res.json({ tutor, matches: db.matches });
  });

  // Admin manual pair
  app.post('/api/admin/matches/create', (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const { parentAppId, tutorAppId } = req.body as { parentAppId?: string; tutorAppId?: string };
    const parent = db.parentApplications.find((p) => p.id === parentAppId);
    const tutor = db.tutorApplications.find((t) => t.id === tutorAppId);
    if (!parent || !tutor) {
      return res.status(404).json({ error: 'Parent or Tutor application not found.' });
    }

    let match = db.matches.find(
      (m) => m.parentAppId === parent.id && m.tutorAppId === tutor.id
    );
    const now = new Date().toISOString();
    if (match) {
      match.status = 'confirmed';
      match.updatedAt = now;
    } else {
      const allKidSubjects = Array.from(new Set(parent.kids.flatMap((k) => k.preferredSubjects)));
      const matchedSubjects = allKidSubjects.filter((s) =>
        tutor.profile.preferredSubjects.includes(s)
      );
      match = {
        id: `match_${crypto.randomUUID().slice(0, 8)}`,
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
        matchedSubjects: matchedSubjects.length > 0 ? matchedSubjects : allKidSubjects,
        matchedLocations: [parent.parentProfile.location],
        matchedSchedule: tutor.profile.preferredDays,
        status: 'confirmed',
        updatedAt: now,
      };
      db.matches.unshift(match);
    }

    parent.status = 'matched';
    saveDatabase(db);
    return res.json({ match });
  });

  // Unmatch confirmed pair (returns applicants back to active unmatched lists)
  app.post('/api/admin/matches/:matchId/unmatch', (req, res) => {
    const admin = getUserFromReq(req);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Coordinator / Admin access required.' });
    }
    const match = db.matches.find((m) => m.id === req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found.' });
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
    recomputeAllMatches(db);
    saveDatabase(db);
    return res.json({ ok: true, match });
  });

  // Build and download a 100% self-contained single index.html file (works offline via file://)
  app.get('/api/download-single-html', async (_req, res) => {
    try {
      const singleOutDir = path.resolve(DATA_DIR, 'dist-single');
      await viteBuild({
        configFile: path.resolve(process.cwd(), 'vite.config.ts'),
        logLevel: 'silent',
        build: {
          outDir: singleOutDir,
          emptyOutDir: true,
          cssCodeSplit: false,
          assetsInlineLimit: 3_000_000,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
      });

      const htmlPath = path.join(singleOutDir, 'index.html');
      let html = fs.readFileSync(htmlPath, 'utf-8');
      const assetsDir = path.join(singleOutDir, 'assets');
      const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

      let cssContent = '';
      let jsContent = '';
      for (const file of assetFiles) {
        if (file.endsWith('.css')) {
          cssContent += fs.readFileSync(path.join(assetsDir, file), 'utf-8') + '\n';
        } else if (file.endsWith('.js')) {
          jsContent += fs.readFileSync(path.join(assetsDir, file), 'utf-8') + '\n';
        }
      }

      // Convert ESM bundle to IIFE so double-clicking index.html via file:// works without CORS errors
      const transformed = await esbuild.transform(jsContent, {
        loader: 'js',
        format: 'iife',
        minify: true,
        target: ['es2020'],
      });
      const safeJs = transformed.code.replace(/<\/script>/gi, '<\\/script>');
      const safeCss = cssContent.replace(/<\/style>/gi, '<\\/style>');

      // Strip external stylesheet & module script tags and inline CSS + IIFE script
      html = html.replace(/<link[^>]+rel="stylesheet"[^>]*>/gi, '');
      html = html.replace(/<script[^>]+type="module"[^>]*><\/script>/gi, '');
      html = html.replace('</head>', () => `<style>${safeCss}</style>\n</head>`);
      html = html.replace('</body>', () => `<script>${safeJs}</script>\n</body>`);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(html);
    } catch (err) {
      console.error('Failed to build single index.html:', err);
      return res.status(500).json({ error: 'Unable to generate single index.html file.' });
    }
  });

  // Search engine crawler endpoints (Google Search Console)
  app.get('/robots.txt', (req, res) => {
    const baseUrl =
      process.env.APP_URL?.replace(/\/+$/, '') ||
      `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl =
      process.env.APP_URL?.replace(/\/+$/, '') ||
      `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
    const lastMod = new Date().toISOString().slice(0, 10);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
    res.type('application/xml').send(xml);
  });

  // Vite integration in dev vs static dist in production
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Askuala Tutors server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
