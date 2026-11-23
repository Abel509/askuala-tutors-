export type UserRole = 'tutor' | 'parent' | 'admin';

export interface UserAccount {
  id: string;
  phone: string;
  role: UserRole;
  fullName?: string;
  createdAt: string;
}

export type EducationLevel =
  | 'below_11'
  | 'grade_11'
  | 'grade_12'
  | 'college'
  | 'bachelors'
  | 'certified_teacher';

export type TutoringMode = 'online' | 'in_person' | 'both';
export type PriorExperience = 'first_time' | '1_year' | '2_plus_years';
export type FeeTier = '400_600' | '600_plus' | '400' | '500' | '600' | '700_plus';
export type SexOption = 'male' | 'female';
export type ParentSexPreference = 'male' | 'female' | 'any';

export interface UploadedPdfDoc {
  recordKey: string;
  label: string;
  fileId: string;
  filename: string;
  pageCount: number;
  sizeBytes: number;
}

export interface UploadedImageDoc {
  side: 'front' | 'back';
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TutorProfileData {
  fullName: string;
  phone: string;
  sex: SexOption | '';
  educationLevel: EducationLevel | '';
  tutoringMode: TutoringMode | '';
  priorExperience: PriorExperience | '';
  preferredLocations: string[];
  preferredSubjects: string[];
  daysPerWeek?: number;
  preferredDays: string[];
  hoursPerDay?: '1' | '2' | '3' | '';
  weekdaySlots: string[];
  weekendSlots: string[];
  expectedFeePerHour: FeeTier | '';
}

export interface TutorAcademicRecords {
  grade9Avg?: string;
  grade10Avg?: string;
  grade11Avg?: string;
  grade12Avg?: string;
  esslceScale?: '600' | '700' | '';
  esslceScore?: string;
  esslceOutOf600?: string;
  graduationCgpa?: string;
}

export interface TutorApplication {
  id: string;
  userId: string;
  status: 'draft' | 'blocked' | 'submitted' | 'verified' | 'rejected';
  blockReason?: string;
  profile: TutorProfileData;
  academicRecords: TutorAcademicRecords;
  uploadedDocuments: UploadedPdfDoc[];
  nationalIdFront?: UploadedImageDoc;
  nationalIdBack?: UploadedImageDoc;
  mergedPdfFileId?: string;
  mergedPdfFilename?: string;
  agreedToTerms?: boolean;
  agreedAt?: string;
  submittedAt?: string;
  updatedAt: string;
}

export type ParentBudgetBracket = '400_500' | 'max_600' | '600_700_efficiency';
export type SchoolType = 'government' | 'private';
export type PrivateCurriculum = 'standard' | 'international';
export type KidSubjectStatus = 'basic' | 'medium' | 'advanced';

export interface KidProfileItem {
  id: string;
  gradeLevel: string;
  daysPerWeek?: number;
  selectedDays: string[];
  hoursPerDay: '1' | '2' | '3' | '';
  weekdaySlots: string[];
  weekendSlots: string[];
  schoolType: SchoolType | '';
  privateCurriculum: PrivateCurriculum | '';
  preferredSubjects: string[];
  subjectStatus: KidSubjectStatus | '';
}

export interface ParentProfileData {
  fullName: string;
  phone: string;
  location: string;
  expectedPaymentPerHour: ParentBudgetBracket | '';
}

export interface ParentTutorPreference {
  sex: ParentSexPreference | '';
  mode: 'online' | 'in_person' | '';
}

export interface ParentApplication {
  id: string;
  userId: string;
  status: 'draft' | 'submitted' | 'matched';
  parentProfile: ParentProfileData;
  kidsCountChoice: '1' | '2' | '3' | 'more';
  kidsCountNumber: number;
  kids: KidProfileItem[];
  tutorPreference: ParentTutorPreference;
  nationalIdFront?: UploadedImageDoc;
  nationalIdBack?: UploadedImageDoc;
  summaryPdfFileId?: string;
  summaryPdfFilename?: string;
  agreedToTerms?: boolean;
  agreedAt?: string;
  submittedAt?: string;
  updatedAt: string;
}

export interface MatchRecord {
  id: string;
  parentAppId: string;
  tutorAppId: string;
  parentName: string;
  parentPhone: string;
  parentLocation: string;
  parentBudget: ParentBudgetBracket;
  tutorName: string;
  tutorPhone: string;
  tutorEducation: EducationLevel;
  tutorFee: FeeTier;
  tutorMode: TutoringMode;
  compatibilityScore: number;
  matchedSubjects: string[];
  matchedLocations: string[];
  matchedSchedule: string[];
  status: 'suggested' | 'requested' | 'confirmed' | 'declined';
  updatedAt: string;
}

export type SiteMode = 'hub' | 'tutor' | 'parent' | 'owner';

export interface AdminTutorItem extends TutorApplication {
  userPassword?: string | null;
}

export interface AdminParentItem extends ParentApplication {
  userPassword?: string | null;
}

