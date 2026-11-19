export interface BilingualOption {
  id: string;
  en: string;
  am: string;
}

export const ADDIS_LOCATIONS: BilingualOption[] = [
  { id: '4_kilo', en: '4 Kilo (Arat Kilo)', am: '፬ ኪሎ (አራት ኪሎ)' },
  { id: '5_kilo', en: '5 Kilo (Amist Kilo)', am: '፭ ኪሎ (አምስት ኪሎ)' },
  { id: '6_kilo', en: '6 Kilo (Sidist Kilo)', am: '፮ ኪሎ (ስድስት ኪሎ)' },
  { id: 'piassa', en: 'Piassa / Arada', am: 'ፒያሳ / አራዳ' },
  { id: 'bole', en: 'Bole', am: 'ቦሌ' },
  { id: 'bole_medhanialem', en: 'Bole Medhanialem', am: 'ቦሌ መድኃኔዓለም' },
  { id: 'bole_bulbula', en: 'Bole Bulbula', am: 'ቦሌ ቡልቡላ' },
  { id: 'bole_arabsa', en: 'Bole Arabsa', am: 'ቦሌ አራብሳ' },
  { id: 'bole_michael', en: 'Bole Michael', am: 'ቦሌ ሚካኤል' },
  { id: 'hayahulet', en: 'Hayahulet (22)', am: 'ሀያ ሁለት (22)' },
  { id: 'kazanchis', en: 'Kazanchis', am: 'ካዛንቺስ' },
  { id: 'megenagna', en: 'Megenagna', am: 'መገናኛ' },
  { id: 'cmc', en: 'CMC', am: 'ሲኤምሲ (CMC)' },
  { id: 'ayat', en: 'Ayat', am: 'አያት' },
  { id: 'summit', en: 'Summit', am: 'ሰሚት' },
  { id: 'gerji', en: 'Gerji', am: 'ገርጂ' },
  { id: 'goro', en: 'Goro', am: 'ጎሮ' },
  { id: 'gurd_shola', en: 'Gurd Shola', am: 'ጉርድ ሾላ' },
  { id: 'lamberet', en: 'Lamberet', am: 'ላምበረት' },
  { id: 'kotebe', en: 'Kotebe', am: 'ኮተቤ' },
  { id: 'yeka_abado', en: 'Yeka Abado / Kara', am: 'የካ አባዶ / ካራ' },
  { id: 'tafo', en: 'Tafo', am: 'ጣፎ' },
  { id: 'shola', en: 'Shola', am: 'ሾላ' },
  { id: 'mexico', en: 'Mexico', am: 'ሜክሲኮ' },
  { id: 'lideta', en: 'Lideta', am: 'ልደታ' },
  { id: 'sarbet', en: 'Sarbet', am: 'ሳር ቤት' },
  { id: 'bisrate_gabriel', en: 'Bisrate Gabriel', am: 'ብስራተ ገብርኤል' },
  { id: 'old_airport', en: 'Old Airport', am: 'አሮጌው አውሮፕላን ማረፊያ' },
  { id: 'kirkos', en: 'Kirkos / Olympia', am: 'ቂርቆስ / ኦሎምፒያ' },
  { id: 'gotera', en: 'Gotera', am: 'ጎተራ' },
  { id: 'kera', en: 'Kera', am: 'ቄራ' },
  { id: 'saris', en: 'Saris', am: 'ሳሪስ' },
  { id: 'gullele', en: 'Gullele / Shiro Meda', am: 'ጉለሌ / ሽሮ ሜዳ' },
  { id: 'winget', en: 'Winget', am: 'ዊንጌት' },
  { id: 'merkato', en: 'Addis Ketema / Merkato', am: 'አዲስ ከተማ / መርካቶ' },
  { id: 'kolfe', en: 'Kolfe Keranio', am: 'ኮልፌ ቀራንዮ' },
  { id: 'bethel', en: 'Bethel', am: 'ቤቴል' },
  { id: 'tor_hailoch', en: 'Tor Hailoch', am: 'ጦር ኃይሎች' },
  { id: 'ayer_tena', en: 'Ayer Tena', am: 'አየር ጤና' },
  { id: 'jemo', en: 'Jemo (1, 2, 3)', am: 'ጀሞ (1, 2, 3)' },
  { id: 'lebu', en: 'Lebu', am: 'ለቡ' },
  { id: 'lafto', en: 'Nifas Silk / Lafto', am: 'ንፋስ ስልክ / ላፍቶ' },
  { id: 'mebrat_hayl', en: 'Mebrat Hayl', am: 'መብራት ኃይል' },
  { id: 'kality', en: 'Kality', am: 'ቃሊቲ' },
  { id: 'akaki', en: 'Akaki', am: 'አቃቂ' },
  { id: 'tulu_dimtu', en: 'Tulu Dimtu', am: 'ቱሉ ዲምቱ' },
];

export interface SubjectOption extends BilingualOption {
  category: 'natural' | 'social' | 'language_exam';
}

export const SUBJECTS: SubjectOption[] = [
  // Natural Sciences
  { id: 'mathematics', en: 'Mathematics', am: 'ሂሳብ', category: 'natural' },
  { id: 'physics', en: 'Physics', am: 'ፊዚክስ', category: 'natural' },
  { id: 'chemistry', en: 'Chemistry', am: 'ኬሚስትሪ', category: 'natural' },
  { id: 'biology', en: 'Biology', am: 'ባዮሎጂ', category: 'natural' },
  { id: 'general_science', en: 'General Science (Env. Science)', am: 'አጠቃላይ ሳይንስ (አካባቢ ሳይንስ)', category: 'natural' },
  { id: 'ict', en: 'ICT / Computer Science', am: 'አይሲቲ (የኮምፒውተር ትምህርት)', category: 'natural' },
  // Social Sciences
  { id: 'geography', en: 'Geography', am: 'ጂኦግራፊ', category: 'social' },
  { id: 'history', en: 'History', am: 'ታሪክ', category: 'social' },
  { id: 'economics', en: 'Economics', am: 'ኢኮኖሚክስ', category: 'social' },
  { id: 'civics', en: 'Civics & Ethical Education', am: 'ሥነ-ዜጋና ሥነ-ምግባር', category: 'social' },
  { id: 'social_studies', en: 'Social Studies', am: 'ማኅበራዊ ጥናት', category: 'social' },
  // Languages & Exam Prep
  { id: 'english', en: 'English (Ethiopian Curriculum)', am: 'እንግሊዝኛ (መደበኛ)', category: 'language_exam' },
  { id: 'afan_oromo', en: 'Afan Oromo', am: 'አፋን ኦሮሞ', category: 'language_exam' },
  { id: 'spoken_english', en: 'Spoken English', am: 'የንግግር እንግሊዝኛ (Spoken English)', category: 'language_exam' },
  { id: 'entrance_exam', en: 'Entrance Exam Preparation (Grade 6, 8, 12)', am: 'የመግቢያ እና ብሔራዊ ፈተና ዝግጅት', category: 'language_exam' },
];

export const TUTOR_FEE_OPTIONS: { id: '400_600' | '600_plus'; en: string }[] = [
  { id: '400_600', en: '400 – 600 ETB' },
  { id: '600_plus', en: '600+ ETB' },
];

export function formatFeeTierLabel(fee?: string): string {
  switch (fee) {
    case '400_600':
      return '400–600 ETB/hr';
    case '600_plus':
      return '600+ ETB/hr';
    case '700_plus':
      return '700+ ETB/hr';
    case '400':
    case '500':
    case '600':
      return `${fee} ETB/hr`;
    default:
      return fee ? `${fee} ETB/hr` : '—';
  }
}

export const DAYS_OF_WEEK: BilingualOption[] = [
  { id: 'monday', en: 'Monday', am: 'ሰኞ' },
  { id: 'tuesday', en: 'Tuesday', am: 'ማክሰኞ' },
  { id: 'wednesday', en: 'Wednesday', am: 'ረቡዕ' },
  { id: 'thursday', en: 'Thursday', am: 'ሐሙስ' },
  { id: 'friday', en: 'Friday', am: 'ዓርብ' },
  { id: 'saturday', en: 'Saturday', am: 'ቅዳሜ' },
  { id: 'sunday', en: 'Sunday', am: 'እሑድ' },
];

export const WEEKDAY_SLOTS: BilingualOption[] = [
  { id: 'wd_10_11', en: '10:00 – 11:00 (Ethiopian Time)', am: 'ከ10:00 – 11:00 ሰዓት (በኢትዮጵያ አቆጣጠር)' },
  { id: 'wd_11_12', en: '11:00 – 12:00 (Ethiopian Time)', am: 'ከ11:00 – 12:00 ሰዓት (በኢትዮጵያ አቆጣጠር)' },
  { id: 'wd_12_1', en: '12:00 – 1:00 (Ethiopian Time)', am: 'ከ12:00 – 1:00 ሰዓት (በኢትዮጵያ አቆጣጠር)' },
];

export const WEEKEND_SLOTS: BilingualOption[] = [
  { id: 'we_3_4', en: '3:00 – 4:00 (Ethiopian Time)', am: 'ከ3:00 – 4:00 ሰዓት' },
  { id: 'we_4_5', en: '4:00 – 5:00 (Ethiopian Time)', am: 'ከ4:00 – 5:00 ሰዓት' },
  { id: 'we_5_6', en: '5:00 – 6:00 (Ethiopian Time)', am: 'ከ5:00 – 6:00 ሰዓት' },
  { id: 'we_8_9', en: '8:00 – 9:00 (Ethiopian Time)', am: 'ከ8:00 – 9:00 ሰዓት' },
  { id: 'we_9_10', en: '9:00 – 10:00 (Ethiopian Time)', am: 'ከ9:00 – 10:00 ሰዓት' },
  { id: 'we_10_11', en: '10:00 – 11:00 (Ethiopian Time)', am: 'ከ10:00 – 11:00 ሰዓት' },
  { id: 'we_11_12', en: '11:00 – 12:00 (Ethiopian Time)', am: 'ከ11:00 – 12:00 ሰዓት' },
  { id: 'we_12_1', en: '12:00 – 1:00 (Ethiopian Time)', am: 'ከ12:00 – 1:00 ሰዓት' },
];

export const KID_GRADE_LEVELS: BilingualOption[] = [
  { id: 'kg', en: 'KG (Kindergarten)', am: 'KG (ኪንደርጋርተን)' },
  { id: 'grade_1', en: 'Grade 1', am: '1ኛ ክፍል' },
  { id: 'grade_2', en: 'Grade 2', am: '2ኛ ክፍል' },
  { id: 'grade_3', en: 'Grade 3', am: '3ኛ ክፍል' },
  { id: 'grade_4', en: 'Grade 4', am: '4ኛ ክፍል' },
  { id: 'grade_5', en: 'Grade 5', am: '5ኛ ክፍል' },
  { id: 'grade_6', en: 'Grade 6', am: '6ኛ ክፍል' },
  { id: 'grade_7', en: 'Grade 7', am: '7ኛ ክፍል' },
  { id: 'grade_8', en: 'Grade 8', am: '8ኛ ክፍል' },
  { id: 'grade_9', en: 'Grade 9', am: '9ኛ ክፍል' },
  { id: 'grade_10', en: 'Grade 10', am: '10ኛ ክፍል' },
  { id: 'grade_11', en: 'Grade 11', am: '11ኛ ክፍል' },
  { id: 'grade_12', en: 'Grade 12', am: '12ኛ ክፍል' },
];

export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  below_11: 'Below Grade 11 (Ineligible)',
  grade_11: 'Grade 11 Student',
  grade_12: 'Grade 12 Student',
  college: 'College / University Student',
  bachelors: "Bachelor's Degree Graduate",
  certified_teacher: 'Certified Teacher',
};

export interface RequiredDocumentSpec {
  recordKey: string;
  label: string;
  helper: string;
}

export function getRequiredAcademicDocuments(level: string): RequiredDocumentSpec[] {
  switch (level) {
    case 'grade_11':
      return [
        { recordKey: 'grade_9_transcript', label: 'Grade 9 Official Transcript (PDF)', helper: 'Must verify average ≥ 87%' },
        { recordKey: 'grade_10_transcript', label: 'Grade 10 Official Transcript (PDF)', helper: 'Must verify average ≥ 87%' },
      ];
    case 'grade_12':
      return [
        { recordKey: 'grade_9_transcript', label: 'Grade 9 Official Transcript (PDF)', helper: 'Must verify average ≥ 87%' },
        { recordKey: 'grade_10_transcript', label: 'Grade 10 Official Transcript (PDF)', helper: 'Must verify average ≥ 87%' },
        { recordKey: 'grade_11_transcript', label: 'Grade 11 Official Transcript (PDF)', helper: 'Must verify average ≥ 87%' },
      ];
    case 'college':
      return [
        { recordKey: 'grade_9_12_transcript', label: 'Grades 9–12 Complete Transcripts (PDF)', helper: 'Combined or scanned transcript verifying ≥ 87% per grade' },
        { recordKey: 'esslce_certificate', label: 'ESSLCE National Exam Result Certificate (PDF)', helper: 'Verifying score converted out of 600' },
        { recordKey: 'college_id_or_grade_report', label: 'University / College Grade Report or Student ID (PDF)', helper: 'Proof of current college enrollment' },
      ];
    case 'bachelors':
      return [
        { recordKey: 'graduation_cgpa_transcript', label: "Bachelor's Degree & Official CGPA Transcript (PDF)", helper: 'Verifying graduation CGPA' },
        { recordKey: 'esslce_certificate', label: 'ESSLCE National Exam Result Certificate (PDF)', helper: 'Verifying ESSLCE score' },
      ];
    case 'certified_teacher':
      return [
        { recordKey: 'teaching_cert_and_cgpa', label: 'Teaching Certificate & Degree CGPA Transcript (PDF)', helper: 'Verifying teacher certification and graduation CGPA' },
        { recordKey: 'esslce_certificate', label: 'ESSLCE National Exam Result Certificate (PDF)', helper: 'Verifying ESSLCE score' },
      ];
    default:
      return [];
  }
}

export function normalizeEthiopianPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (/^\+251[97]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^251[97]\d{8}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  if (/^0[97]\d{8}$/.test(cleaned)) {
    return '+251' + cleaned.slice(1);
  }
  return null;
}

export function suggestStrong8CharPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    all[Math.floor(Math.random() * all.length)],
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function evaluatePasswordStrength(pw: string): {
  valid: boolean;
  checks: { length: boolean; upper: boolean; lower: boolean; digit: boolean; symbol: boolean };
} {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  return {
    valid: checks.length && checks.upper && checks.lower && checks.digit && checks.symbol,
    checks,
  };
}
