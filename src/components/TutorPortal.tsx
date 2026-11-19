import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Maximize2,
  Printer,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  ADDIS_LOCATIONS,
  DAYS_OF_WEEK,
  EDUCATION_LEVEL_LABELS,
  getRequiredAcademicDocuments,
  normalizeEthiopianPhone,
  SUBJECTS,
  WEEKDAY_SLOTS,
  WEEKEND_SLOTS,
} from '../data/catalog';
import type {
  EducationLevel,
  FeeTier,
  PriorExperience,
  SexOption,
  TutorAcademicRecords,
  TutorApplication,
  TutoringMode,
  TutorProfileData,
  UploadedPdfDoc,
  UserAccount,
} from '../types/app';
import { saveTutorApplication, uploadPdfFile } from '../utils/api';
import { buildTutorUnifiedPdf } from '../utils/pdfComposer';

interface TutorPortalProps {
  user: UserAccount;
  existingApplication: TutorApplication | null;
  onApplicationUpdated: (app: TutorApplication) => void;
  onExitToHome: () => void;
}

export const TutorPortal: React.FC<TutorPortalProps> = ({
  user,
  existingApplication,
  onApplicationUpdated,
  onExitToHome,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [locationSearch, setLocationSearch] = useState('');

  const [profile, setProfile] = useState<TutorProfileData>(() => ({
    fullName: existingApplication?.profile.fullName || user.fullName || '',
    phone: existingApplication?.profile.phone || user.phone || '',
    sex: existingApplication?.profile.sex || '',
    educationLevel: existingApplication?.profile.educationLevel || '',
    tutoringMode: existingApplication?.profile.tutoringMode || '',
    priorExperience: existingApplication?.profile.priorExperience || '',
    preferredLocations: existingApplication?.profile.preferredLocations || [],
    preferredSubjects: existingApplication?.profile.preferredSubjects || [],
    preferredDays: existingApplication?.profile.preferredDays || [],
    weekdaySlots: existingApplication?.profile.weekdaySlots || [],
    weekendSlots: existingApplication?.profile.weekendSlots || [],
    expectedFeePerHour: existingApplication?.profile.expectedFeePerHour || '',
  }));

  const [academicRecords, setAcademicRecords] = useState<TutorAcademicRecords>(
    existingApplication?.academicRecords || {}
  );

  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedPdfDoc[]>(
    existingApplication?.uploadedDocuments || []
  );

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const [missingMessages, setMissingMessages] = useState<string[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfBytes, setPreviewPdfBytes] = useState<Uint8Array | null>(null);
  const [previewPageUrls, setPreviewPageUrls] = useState<string[]>([]);
  const [previewPagesCount, setPreviewPagesCount] = useState<number>(0);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [fullScreenPdf, setFullScreenPdf] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const isBlockedBelowGrade11 = profile.educationLevel === 'below_11';

  const requiredGradeFields = useMemo(() => {
    switch (profile.educationLevel) {
      case 'grade_11':
        return [
          { key: 'grade9Avg' as const, label: 'Grade 9 Average (%)' },
          { key: 'grade10Avg' as const, label: 'Grade 10 Average (%)' },
        ];
      case 'grade_12':
        return [
          { key: 'grade9Avg' as const, label: 'Grade 9 Average (%)' },
          { key: 'grade10Avg' as const, label: 'Grade 10 Average (%)' },
          { key: 'grade11Avg' as const, label: 'Grade 11 Average (%)' },
        ];
      case 'college':
        return [
          { key: 'grade9Avg' as const, label: 'Grade 9 Average (%)' },
          { key: 'grade10Avg' as const, label: 'Grade 10 Average (%)' },
          { key: 'grade11Avg' as const, label: 'Grade 11 Average (%)' },
          { key: 'grade12Avg' as const, label: 'Grade 12 Average (%)' },
        ];
      default:
        return [];
    }
  }, [profile.educationLevel]);

  const below87Violations = useMemo(() => {
    const violations: string[] = [];
    for (const f of requiredGradeFields) {
      const valStr = academicRecords[f.key];
      if (valStr !== undefined && valStr.trim() !== '') {
        const num = Number(valStr);
        if (Number.isNaN(num) || num < 87 || num > 100) {
          violations.push(`${f.label}: ${valStr} (must be 87 to 100)`);
        }
      }
    }
    return violations;
  }, [requiredGradeFields, academicRecords]);

  const requiredDocs = useMemo(
    () => getRequiredAcademicDocuments(profile.educationLevel),
    [profile.educationLevel]
  );

  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return ADDIS_LOCATIONS;
    return ADDIS_LOCATIONS.filter(
      (loc) => loc.en.toLowerCase().includes(q) || loc.am.includes(q)
    );
  }, [locationSearch]);

  const clearFieldError = (key: string) => {
    setMissingFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const scrollToTopOrFirstError = (hasErrors: boolean) => {
    window.setTimeout(() => {
      if (hasErrors) {
        const firstBad = scrollContainerRef.current?.querySelector('[data-field-error="true"]');
        if (firstBad) {
          firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 30);
  };

  const toggleMulti = (
    field:
      | 'preferredLocations'
      | 'preferredSubjects'
      | 'preferredDays'
      | 'weekdaySlots'
      | 'weekendSlots',
    id: string
  ) => {
    clearFieldError(field);
    if (field === 'weekdaySlots' || field === 'weekendSlots') {
      clearFieldError('schedule');
    }
    setProfile((prev) => {
      const list = prev[field];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [field]: next };
    });
  };

  const validateStep1All = (): { fields: Set<string>; messages: string[] } => {
    const fields = new Set<string>();
    const messages: string[] = [];

    if (!profile.fullName.trim()) {
      fields.add('fullName');
      messages.push('Full Name is required.');
    }
    if (!normalizeEthiopianPhone(profile.phone)) {
      fields.add('phone');
      messages.push('Valid Ethiopian Phone Number (09XXXXXXXX or +2519XXXXXXXX) is required.');
    }
    if (!profile.sex) {
      fields.add('sex');
      messages.push('Sex is required.');
    }
    if (!profile.educationLevel) {
      fields.add('educationLevel');
      messages.push('Education Level is required.');
    } else if (profile.educationLevel === 'below_11') {
      fields.add('educationLevel');
      messages.push('Applicants below Grade 11 are automatically blocked.');
    }
    if (!profile.tutoringMode) {
      fields.add('tutoringMode');
      messages.push('Tutoring Mode Availability is required.');
    }
    if (!profile.priorExperience) {
      fields.add('priorExperience');
      messages.push('Prior Experience is required.');
    }
    if (!profile.expectedFeePerHour) {
      fields.add('expectedFeePerHour');
      messages.push('Expected Fee per Hour is required.');
    }
    if (profile.preferredLocations.length === 0) {
      fields.add('preferredLocations');
      messages.push('Select at least one Preferred Addis Ababa Location.');
    }
    if (profile.preferredSubjects.length === 0) {
      fields.add('preferredSubjects');
      messages.push('Select at least one Preferred Subject.');
    }
    if (profile.preferredDays.length === 0) {
      fields.add('preferredDays');
      messages.push('Select at least one Preferred Day.');
    }
    if (profile.weekdaySlots.length === 0 && profile.weekendSlots.length === 0) {
      fields.add('schedule');
      messages.push('Select at least one Preferred Schedule time slot (Weekday or Weekend).');
    }

    return { fields, messages };
  };

  const validateStep2All = (): { fields: Set<string>; messages: string[] } => {
    const fields = new Set<string>();
    const messages: string[] = [];

    for (const f of requiredGradeFields) {
      const val = academicRecords[f.key];
      if (!val || val.trim() === '') {
        fields.add(f.key);
        messages.push(`${f.label} is required.`);
      } else {
        const num = Number(val);
        if (Number.isNaN(num) || num < 87 || num > 100) {
          fields.add(f.key);
          messages.push(`Automatic Block: ${f.label} (${val}) must be 87 or above.`);
        }
      }
    }

    if (profile.educationLevel === 'college') {
      const e = Number(academicRecords.esslceOutOf600);
      if (!academicRecords.esslceOutOf600 || Number.isNaN(e) || e <= 0 || e > 600) {
        fields.add('esslceOutOf600');
        messages.push('ESSLCE score converted out of 600 (1–600) is required.');
      }
    }

    if (
      profile.educationLevel === 'bachelors' ||
      profile.educationLevel === 'certified_teacher'
    ) {
      const cgpa = Number(academicRecords.graduationCgpa);
      if (!academicRecords.graduationCgpa || Number.isNaN(cgpa) || cgpa <= 0 || cgpa > 4.0) {
        fields.add('graduationCgpa');
        messages.push('Graduation CGPA (out of 4.00) is required.');
      }
      const e = Number(academicRecords.esslceOutOf600);
      if (!academicRecords.esslceOutOf600 || Number.isNaN(e) || e <= 0) {
        fields.add('esslceOutOf600');
        messages.push('ESSLCE National Exam Score is required.');
      }
    }

    return { fields, messages };
  };

  const validateStep3All = (): { fields: Set<string>; messages: string[] } => {
    const fields = new Set<string>();
    const messages: string[] = [];

    for (const docSpec of requiredDocs) {
      const found = uploadedDocuments.find((u) => u.recordKey === docSpec.recordKey);
      if (!found) {
        fields.add(`doc_${docSpec.recordKey}`);
        messages.push(`Upload required PDF: ${docSpec.label}`);
      }
    }

    return { fields, messages };
  };

  const resetValidation = () => {
    setMissingFields(new Set());
    setMissingMessages([]);
    setStepError(null);
  };

  const handleNext = async () => {
    resetValidation();
    if (step === 1) {
      const { fields, messages } = validateStep1All();
      if (messages.length > 0) {
        setMissingFields(fields);
        setMissingMessages(messages);
        scrollToTopOrFirstError(true);
        return;
      }
      setSaving(true);
      try {
        const res = await saveTutorApplication({
          profile,
          academicRecords,
          uploadedDocuments,
          submit: false,
        });
        onApplicationUpdated(res.application);
        setStep(2);
        scrollToTopOrFirstError(false);
      } catch (e) {
        setStepError(e instanceof Error ? e.message : 'Unable to save draft');
      } finally {
        setSaving(false);
      }
    } else if (step === 2) {
      const { fields, messages } = validateStep2All();
      if (messages.length > 0) {
        setMissingFields(fields);
        setMissingMessages(messages);
        scrollToTopOrFirstError(true);
        return;
      }
      setSaving(true);
      try {
        const res = await saveTutorApplication({
          profile,
          academicRecords,
          uploadedDocuments,
          submit: false,
        });
        onApplicationUpdated(res.application);
        setStep(3);
        scrollToTopOrFirstError(false);
      } catch (e) {
        setStepError(e instanceof Error ? e.message : 'Unable to save academic records');
      } finally {
        setSaving(false);
      }
    } else if (step === 3) {
      const { fields, messages } = validateStep3All();
      if (messages.length > 0) {
        setMissingFields(fields);
        setMissingMessages(messages);
        scrollToTopOrFirstError(true);
        return;
      }
      setStep(4);
      scrollToTopOrFirstError(false);
      await generateCombinedPdfPreview();
    }
  };

  const handlePreviousOrExit = () => {
    resetValidation();
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3 | 4);
      scrollToTopOrFirstError(false);
    } else {
      onExitToHome();
    }
  };

  const handlePdfUpload = async (recordKey: string, label: string, file: File | null) => {
    if (!file) return;
    setStepError(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setStepError('Only PDF files (.pdf) are allowed for academic document uploads.');
      return;
    }
    setUploadingKey(recordKey);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const uploaded = await uploadPdfFile(file.name, buf);
      const entry: UploadedPdfDoc = {
        recordKey,
        label,
        fileId: uploaded.fileId,
        filename: uploaded.filename,
        pageCount: uploaded.pageCount,
        sizeBytes: uploaded.sizeBytes,
      };
      setUploadedDocuments((prev) => [
        ...prev.filter((d) => d.recordKey !== recordKey),
        entry,
      ]);
      clearFieldError(`doc_${recordKey}`);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Failed to upload PDF');
    } finally {
      setUploadingKey(null);
    }
  };

  const generateCombinedPdfPreview = async () => {
    setBuildingPdf(true);
    setStepError(null);
    try {
      const { pdfBytes, totalPages, previewPageUrls: pages } = await buildTutorUnifiedPdf(
        profile,
        academicRecords,
        uploadedDocuments
      );
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewPdfBytes(pdfBytes);
      setPreviewPdfUrl(url);
      setPreviewPageUrls(pages);
      setPreviewPagesCount(totalPages);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Unable to build unified application PDF.');
    } finally {
      setBuildingPdf(false);
    }
  };

  const handleFinalSubmit = async () => {
    setSaving(true);
    setStepError(null);
    try {
      let mergedFileId = existingApplication?.mergedPdfFileId;
      let mergedFilename = `${profile.fullName.replace(/\s+/g, '_') || 'Tutor'}_Askuala_Application.pdf`;

      if (previewPdfBytes) {
        const up = await uploadPdfFile(mergedFilename, previewPdfBytes);
        mergedFileId = up.fileId;
        mergedFilename = up.filename;
      }

      const res = await saveTutorApplication({
        profile,
        academicRecords,
        uploadedDocuments,
        mergedPdfFileId: mergedFileId,
        mergedPdfFilename: mergedFilename,
        submit: true,
      });
      onApplicationUpdated(res.application);
      setSubmittedSuccess(true);
      scrollToTopOrFirstError(false);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = [
    '1. Profile & Preferences',
    '2. Academic Records',
    '3. Document Upload',
    '4. Review Application PDF & Submit',
  ];

  const isErr = (key: string) => missingFields.has(key);

  return (
    <div ref={scrollContainerRef} className="font-english">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
        <div className="white-card p-6 sm:p-8">
          {/* Top Back / Exit Bar Inside Card */}
          <div className="mb-4 pb-3 border-b border-[#dcfce7] flex flex-wrap items-center justify-between gap-2 no-print">
            <button
              type="button"
              onClick={handlePreviousOrExit}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border-2 border-[#22c55e] bg-white text-[#14532d] font-bold text-sm hover:bg-[#f0fdf4] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>{step > 1 && !submittedSuccess ? `Back to Section ${step - 1}` : 'Back to Home'}</span>
            </button>

            {step > 1 && !submittedSuccess && (
              <button
                type="button"
                onClick={onExitToHome}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#14532d] bg-[#f0fdf4] text-[#14532d] font-bold text-sm hover:bg-[#dcfce7] cursor-pointer"
              >
                <span>Exit to Home</span>
              </button>
            )}
          </div>

          <div className="mb-5">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#14532d]">
              <span className="font-amharic">ኣስኳላ</span> Tutor Application Portal
            </h1>
            <p className="text-[#475569] mt-1">
              Tutor with full dedication while earning and learning at once &mdash; Complete all 4
              sections accurately in English.
            </p>
          </div>

          {/* Stepper */}
          <nav aria-label="Tutor application steps" className="mb-6 no-print">
            <ol className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              {stepLabels.map((label, idx) => {
                const num = (idx + 1) as 1 | 2 | 3 | 4;
                const active = step === num && !submittedSuccess;
                const completed = step > num || submittedSuccess;
                return (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => {
                        if (num < step && !submittedSuccess) {
                          resetValidation();
                          setStep(num);
                        }
                      }}
                      disabled={num > step || submittedSuccess}
                      aria-current={active ? 'step' : undefined}
                      className={`w-full text-center px-3 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                        active
                          ? 'bg-[#14532d] text-white border-[#14532d]'
                          : completed
                          ? 'bg-[#dcfce7] text-[#166534] border-[#22c55e] cursor-pointer'
                          : 'bg-[#f0fdf4] text-[#14532d] border-[#bbf7d0] cursor-not-allowed'
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* All Missing Fields Summary Banner */}
          {!submittedSuccess && missingMessages.length > 0 && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 p-4 rounded-xl bg-[#fef2f2] border-2 border-[#dc2626] text-[#991b1b] space-y-2"
            >
              <div className="flex items-center gap-2 font-bold text-base">
                <AlertTriangle className="w-5 h-5 shrink-0 text-[#dc2626]" aria-hidden="true" />
                <span>
                  Please complete all {missingMessages.length} highlighted required section
                  {missingMessages.length > 1 ? 's' : ''} before continuing:
                </span>
              </div>
              <ul className="list-disc pl-6 text-sm font-semibold space-y-1">
                {missingMessages.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {submittedSuccess ? (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="w-14 h-14 text-[#16a34a] mx-auto" aria-hidden="true" />
              <h2 className="text-2xl font-bold text-[#14532d]">
                Application Submitted Successfully!
              </h2>
              <p className="text-[#475569] max-w-xl mx-auto">
                Your complete tutor dossier and unified PDF ({previewPagesCount} pages including all
                uploaded academic documents) have been received. Our Coordinator will verify your
                documents and contact you directly on{' '}
                <strong className="text-[#14532d] tabular-nums">{profile.phone}</strong> when
                matched with a family.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-3 no-print">
                {previewPdfUrl && (
                  <a
                    href={previewPdfUrl}
                    download={`${profile.fullName.replace(/\s+/g, '_') || 'Tutor'}_Askuala_Application.pdf`}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl border-2 border-[#22c55e] text-[#14532d] font-bold inline-flex items-center gap-2 hover:bg-[#f0fdf4]"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>Download Application PDF</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border-2 border-[#14532d] text-[#14532d] font-bold inline-flex items-center gap-2 hover:bg-[#f0fdf4] cursor-pointer"
                >
                  <Printer className="w-4 h-4" aria-hidden="true" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={onExitToHome}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] cursor-pointer"
                >
                  ← Exit to Home
                </button>
              </div>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-5">
                  <div className="instruction-box">
                    <span>📝</span>
                    <span>
                      Instruction: Fill in every required (*) section accurately. Applicants below
                      Grade 11 are automatically blocked. Select as many Addis Ababa locations,
                      subjects, days, and Ethiopian schedule slots as you prefer.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-field-error={isErr('fullName') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-fullname"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Full Name *
                      </label>
                      <input
                        id="tutor-fullname"
                        type="text"
                        aria-invalid={isErr('fullName')}
                        value={profile.fullName}
                        onChange={(e) => {
                          clearFieldError('fullName');
                          setProfile({ ...profile, fullName: e.target.value });
                        }}
                        placeholder="First and Last Name"
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('fullName') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      />
                    </div>

                    <div data-field-error={isErr('phone') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-phone"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Ethiopian Phone No. *
                      </label>
                      <input
                        id="tutor-phone"
                        type="tel"
                        aria-invalid={isErr('phone')}
                        value={profile.phone}
                        onChange={(e) => {
                          clearFieldError('phone');
                          setProfile({ ...profile, phone: e.target.value });
                        }}
                        placeholder="0911223344 or +251911223344"
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white tabular-nums ${
                          isErr('phone') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      />
                    </div>

                    <div data-field-error={isErr('sex') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-sex"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Sex *
                      </label>
                      <select
                        id="tutor-sex"
                        aria-invalid={isErr('sex')}
                        value={profile.sex}
                        onChange={(e) => {
                          clearFieldError('sex');
                          setProfile({ ...profile, sex: e.target.value as SexOption | '' });
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('sex') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      >
                        <option value="">-- Select Sex --</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </div>

                    <div data-field-error={isErr('educationLevel') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-edu"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Education Level *
                      </label>
                      <select
                        id="tutor-edu"
                        aria-invalid={isErr('educationLevel')}
                        value={profile.educationLevel}
                        onChange={(e) => {
                          clearFieldError('educationLevel');
                          setProfile({
                            ...profile,
                            educationLevel: e.target.value as EducationLevel | '',
                          });
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('educationLevel') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      >
                        <option value="">-- Select Education Level --</option>
                        <option value="below_11">Below Grade 11 (Automatically Blocked)</option>
                        <option value="grade_11">Grade 11</option>
                        <option value="grade_12">Grade 12</option>
                        <option value="college">College Student</option>
                        <option value="bachelors">Bachelor&apos;s Graduate</option>
                        <option value="certified_teacher">Certified Teacher</option>
                      </select>
                    </div>
                  </div>

                  {isBlockedBelowGrade11 && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="p-4 rounded-xl bg-[#fef2f2] border-2 border-[#fca5a5] text-[#dc2626] font-bold flex items-start gap-3"
                    >
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <p>Application Automatically Blocked &mdash; Below Grade 11</p>
                        <p className="text-sm font-normal mt-1">
                          Applicants below Grade 11 are not allowed to apply as tutors on ኣስኳላ
                          Tutors.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div data-field-error={isErr('tutoringMode') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-mode"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Tutoring Mode Availability *
                      </label>
                      <select
                        id="tutor-mode"
                        aria-invalid={isErr('tutoringMode')}
                        value={profile.tutoringMode}
                        onChange={(e) => {
                          clearFieldError('tutoringMode');
                          setProfile({
                            ...profile,
                            tutoringMode: e.target.value as TutoringMode | '',
                          });
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('tutoringMode') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      >
                        <option value="">-- Select Mode --</option>
                        <option value="online">Online</option>
                        <option value="in_person">In-person</option>
                        <option value="both">Both available</option>
                      </select>
                    </div>

                    <div data-field-error={isErr('priorExperience') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-exp"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Prior Experience *
                      </label>
                      <select
                        id="tutor-exp"
                        aria-invalid={isErr('priorExperience')}
                        value={profile.priorExperience}
                        onChange={(e) => {
                          clearFieldError('priorExperience');
                          setProfile({
                            ...profile,
                            priorExperience: e.target.value as PriorExperience | '',
                          });
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('priorExperience') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      >
                        <option value="">-- Select Experience --</option>
                        <option value="first_time">First time</option>
                        <option value="1_year">1 year</option>
                        <option value="2_plus_years">2 years+</option>
                      </select>
                    </div>

                    <div data-field-error={isErr('expectedFeePerHour') ? 'true' : undefined}>
                      <label
                        htmlFor="tutor-fee"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        Expected Fee per Hour *
                      </label>
                      <select
                        id="tutor-fee"
                        aria-invalid={isErr('expectedFeePerHour')}
                        value={profile.expectedFeePerHour}
                        onChange={(e) => {
                          clearFieldError('expectedFeePerHour');
                          setProfile({
                            ...profile,
                            expectedFeePerHour: e.target.value as FeeTier | '',
                          });
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white tabular-nums ${
                          isErr('expectedFeePerHour') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      >
                        <option value="">-- Select Hourly Fee --</option>
                        <option value="400">400 ETB</option>
                        <option value="500">500 ETB</option>
                        <option value="600">600 ETB</option>
                        <option value="700_plus">700 ETB and over</option>
                      </select>
                    </div>
                  </div>

                  {/* Preferred Addis Ababa Locations */}
                  <fieldset
                    data-field-error={isErr('preferredLocations') ? 'true' : undefined}
                    className={`p-4 rounded-xl bg-[#f0fdf4] border ${
                      isErr('preferredLocations') ? 'field-error' : 'border-[#bbf7d0]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <legend className="text-sm font-bold text-[#14532d]">
                        Preferred Addis Ababa Locations * ({profile.preferredLocations.length}{' '}
                        selected)
                      </legend>
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-60">
                          <Search
                            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#15803d]"
                            aria-hidden="true"
                          />
                          <input
                            type="search"
                            value={locationSearch}
                            onChange={(e) => setLocationSearch(e.target.value)}
                            placeholder="Filter 4 Kilo, 5 Kilo, 6 Kilo, Bole..."
                            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-lg border border-[#22c55e] bg-white text-sm"
                          />
                        </div>
                        {profile.preferredLocations.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setProfile({ ...profile, preferredLocations: [] })}
                            className="px-2.5 py-1.5 rounded-lg border border-[#22c55e] bg-white text-xs font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                      {filteredLocations.map((loc) => {
                        const checked = profile.preferredLocations.includes(loc.id);
                        return (
                          <label
                            key={loc.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer font-semibold ${
                              checked
                                ? 'bg-[#14532d] text-white border-[#14532d]'
                                : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMulti('preferredLocations', loc.id)}
                              className="sr-only"
                            />
                            <span className="truncate">{loc.en}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* Preferred Subjects */}
                  <fieldset
                    data-field-error={isErr('preferredSubjects') ? 'true' : undefined}
                    className={`p-4 rounded-xl bg-[#f0fdf4] border ${
                      isErr('preferredSubjects') ? 'field-error' : 'border-[#bbf7d0]'
                    }`}
                  >
                    <legend className="text-sm font-bold text-[#14532d] mb-3">
                      Preferred Subjects * (Natural Sciences, Social Sciences, Afan Oromo, Spoken
                      English, Entrance Exam Prep &mdash; {profile.preferredSubjects.length}{' '}
                      selected)
                    </legend>
                    <div className="space-y-4">
                      {(
                        [
                          { cat: 'natural', title: 'Natural Sciences & ICT' },
                          { cat: 'social', title: 'Social Sciences' },
                          { cat: 'language_exam', title: 'Languages & Entrance Exam Preparation' },
                        ] as const
                      ).map((group) => (
                        <div key={group.cat}>
                          <p className="text-xs font-bold uppercase tracking-wider text-[#15803d] mb-2">
                            {group.title}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {SUBJECTS.filter((s) => s.category === group.cat).map((subj) => {
                              const checked = profile.preferredSubjects.includes(subj.id);
                              return (
                                <label
                                  key={subj.id}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer font-semibold ${
                                    checked
                                      ? 'bg-[#14532d] text-white border-[#14532d]'
                                      : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleMulti('preferredSubjects', subj.id)}
                                    className="sr-only"
                                  />
                                  <span>{subj.en}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  {/* Preferred Days */}
                  <fieldset
                    data-field-error={isErr('preferredDays') ? 'true' : undefined}
                    className={`p-4 rounded-xl bg-[#f0fdf4] border ${
                      isErr('preferredDays') ? 'field-error' : 'border-[#bbf7d0]'
                    }`}
                  >
                    <legend className="text-sm font-bold text-[#14532d] mb-2">
                      Preferred Days *
                    </legend>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                      {DAYS_OF_WEEK.map((day) => {
                        const checked = profile.preferredDays.includes(day.id);
                        return (
                          <label
                            key={day.id}
                            className={`flex items-center justify-center px-3 py-2 rounded-lg border text-sm cursor-pointer font-bold ${
                              checked
                                ? 'bg-[#14532d] text-white border-[#14532d]'
                                : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMulti('preferredDays', day.id)}
                              className="sr-only"
                            />
                            <span>{day.en}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* Preferred Schedule (Ethiopian Time) */}
                  <div
                    data-field-error={isErr('schedule') ? 'true' : undefined}
                    className={`grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl ${
                      isErr('schedule') ? 'field-error p-2' : ''
                    }`}
                  >
                    <fieldset className="p-4 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0]">
                      <legend className="text-sm font-bold text-[#14532d] mb-2">
                        Weekday Schedule (Ethiopian Time) *
                      </legend>
                      <div className="space-y-2">
                        {WEEKDAY_SLOTS.map((slot) => {
                          const checked = profile.weekdaySlots.includes(slot.id);
                          return (
                            <label
                              key={slot.id}
                              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm cursor-pointer font-semibold tabular-nums ${
                                checked
                                  ? 'bg-[#14532d] text-white border-[#14532d]'
                                  : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMulti('weekdaySlots', slot.id)}
                                className="sr-only"
                              />
                              <span>{slot.en}</span>
                              <span>{checked ? '✓' : ''}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <fieldset className="p-4 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0]">
                      <legend className="text-sm font-bold text-[#14532d] mb-2">
                        Weekend Schedule (Ethiopian Time) *
                      </legend>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {WEEKEND_SLOTS.map((slot) => {
                          const checked = profile.weekendSlots.includes(slot.id);
                          return (
                            <label
                              key={slot.id}
                              className={`flex items-center justify-center px-3 py-2.5 rounded-lg border text-xs sm:text-sm cursor-pointer font-semibold tabular-nums ${
                                checked
                                  ? 'bg-[#14532d] text-white border-[#14532d]'
                                  : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMulti('weekendSlots', slot.id)}
                                className="sr-only"
                              />
                              <span>{slot.en.replace(' (Ethiopian Time)', '')}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="instruction-box">
                    <span>🎓</span>
                    <span>
                      Instruction: Entering scores for{' '}
                      <strong>{EDUCATION_LEVEL_LABELS[profile.educationLevel]}</strong>. Transcript
                      average for EACH grade must be <strong>87 or above</strong>. Below 87 is
                      automatically blocked.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {requiredGradeFields.map((field) => {
                      const rawVal = academicRecords[field.key] || '';
                      const num = Number(rawVal);
                      const isBelow =
                        rawVal.trim() !== '' && (Number.isNaN(num) || num < 87 || num > 100);
                      const flagged = isBelow || isErr(field.key);
                      return (
                        <div
                          key={field.key}
                          data-field-error={flagged ? 'true' : undefined}
                        >
                          <label
                            htmlFor={`rec-${field.key}`}
                            className="block text-sm font-bold text-[#14532d] mb-1"
                          >
                            {field.label} * (&ge; 87 required)
                          </label>
                          <input
                            id={`rec-${field.key}`}
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={rawVal}
                            aria-invalid={flagged}
                            onChange={(e) => {
                              clearFieldError(field.key);
                              setAcademicRecords({
                                ...academicRecords,
                                [field.key]: e.target.value,
                              });
                            }}
                            placeholder="87.0 – 100.0"
                            className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white tabular-nums ${
                              flagged ? 'field-error' : 'border-[#cbd5e1]'
                            }`}
                          />
                        </div>
                      );
                    })}

                    {(profile.educationLevel === 'bachelors' ||
                      profile.educationLevel === 'certified_teacher') && (
                      <div data-field-error={isErr('graduationCgpa') ? 'true' : undefined}>
                        <label
                          htmlFor="rec-cgpa"
                          className="block text-sm font-bold text-[#14532d] mb-1"
                        >
                          Graduation CGPA (out of 4.00) *
                        </label>
                        <input
                          id="rec-cgpa"
                          type="number"
                          step="0.01"
                          min="0"
                          max="4"
                          aria-invalid={isErr('graduationCgpa')}
                          value={academicRecords.graduationCgpa || ''}
                          onChange={(e) => {
                            clearFieldError('graduationCgpa');
                            setAcademicRecords({
                              ...academicRecords,
                              graduationCgpa: e.target.value,
                            });
                          }}
                          placeholder="e.g. 3.75"
                          className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white tabular-nums ${
                            isErr('graduationCgpa') ? 'field-error' : 'border-[#cbd5e1]'
                          }`}
                        />
                      </div>
                    )}

                    {(profile.educationLevel === 'college' ||
                      profile.educationLevel === 'bachelors' ||
                      profile.educationLevel === 'certified_teacher') && (
                      <div data-field-error={isErr('esslceOutOf600') ? 'true' : undefined}>
                        <label
                          htmlFor="rec-esslce"
                          className="block text-sm font-bold text-[#14532d] mb-1"
                        >
                          {profile.educationLevel === 'college'
                            ? 'ESSLCE Score Converted Out of 600 *'
                            : 'ESSLCE National Exam Score *'}
                        </label>
                        <input
                          id="rec-esslce"
                          type="number"
                          min="0"
                          max="700"
                          aria-invalid={isErr('esslceOutOf600')}
                          value={academicRecords.esslceOutOf600 || ''}
                          onChange={(e) => {
                            clearFieldError('esslceOutOf600');
                            setAcademicRecords({
                              ...academicRecords,
                              esslceOutOf600: e.target.value,
                            });
                          }}
                          placeholder="e.g. 540"
                          className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white tabular-nums ${
                            isErr('esslceOutOf600') ? 'field-error' : 'border-[#cbd5e1]'
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  {below87Violations.length > 0 && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="p-4 rounded-xl bg-[#fef2f2] border-2 border-[#fca5a5] text-[#dc2626] font-bold flex items-start gap-3"
                    >
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <p>Automatic Block &mdash; Transcript Average Below 87%</p>
                        <ul className="list-disc ml-5 text-sm mt-1 font-normal">
                          {below87Violations.map((v) => (
                            <li key={v}>{v}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="instruction-box">
                    <span>📎</span>
                    <span>
                      Instruction: Upload official PDF documents for every record listed in Section
                      2. Only .pdf files are accepted, and every visible page will be included
                      inside your Review Application PDF in Section 4.
                    </span>
                  </div>

                  <div className="space-y-3">
                    {requiredDocs.map((docSpec) => {
                      const existing = uploadedDocuments.find(
                        (d) => d.recordKey === docSpec.recordKey
                      );
                      const isUploading = uploadingKey === docSpec.recordKey;
                      const flagged = isErr(`doc_${docSpec.recordKey}`);
                      return (
                        <div
                          key={docSpec.recordKey}
                          data-field-error={flagged ? 'true' : undefined}
                          className={`p-4 rounded-xl bg-[#f0fdf4] border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                            flagged ? 'field-error' : 'border-[#bbf7d0]'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-[#14532d]">{docSpec.label} *</p>
                            <p className="text-xs text-[#475569] mt-0.5">{docSpec.helper}</p>
                            {existing && (
                              <p className="text-xs text-[#15803d] font-bold mt-1.5 flex items-center gap-1.5 tabular-nums">
                                <FileText className="w-4 h-4" aria-hidden="true" />
                                <span>
                                  {existing.filename} ({existing.pageCount} page
                                  {existing.pageCount > 1 ? 's' : ''})
                                </span>
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <label className="min-h-[42px] px-4 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold hover:bg-[#166534] inline-flex items-center gap-2 cursor-pointer">
                              <FileUp className="w-4 h-4" aria-hidden="true" />
                              <span>
                                {isUploading
                                  ? 'Uploading...'
                                  : existing
                                  ? 'Replace PDF'
                                  : 'Upload PDF'}
                              </span>
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                className="sr-only"
                                onChange={(e) =>
                                  handlePdfUpload(
                                    docSpec.recordKey,
                                    docSpec.label,
                                    e.target.files?.[0] || null
                                  )
                                }
                              />
                            </label>

                            {existing && (
                              <button
                                type="button"
                                onClick={() =>
                                  setUploadedDocuments((prev) =>
                                    prev.filter((d) => d.recordKey !== docSpec.recordKey)
                                  )
                                }
                                aria-label={`Remove ${docSpec.label}`}
                                className="min-h-[42px] px-3 py-2 rounded-xl border border-[#fca5a5] bg-white text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="instruction-box no-print">
                    <span>📄</span>
                    <span>
                      Instruction: Review your unified {previewPagesCount}-page Application PDF
                      below (your entered details + all visible pages of your uploaded PDFs),
                      download a copy, and click Submit Application.
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 no-print">
                    <button
                      type="button"
                      onClick={generateCombinedPdfPreview}
                      disabled={buildingPdf}
                      className="min-h-[40px] px-4 py-2 rounded-xl border border-[#22c55e] text-[#14532d] text-sm font-bold hover:bg-[#f0fdf4] cursor-pointer"
                    >
                      {buildingPdf ? 'Rebuilding...' : 'Refresh PDF'}
                    </button>
                    {previewPdfUrl && (
                      <>
                        <button
                          type="button"
                          onClick={() => setFullScreenPdf(true)}
                          className="min-h-[40px] px-4 py-2 rounded-xl border border-[#14532d] text-[#14532d] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                        >
                          <Maximize2 className="w-4 h-4" aria-hidden="true" />
                          <span>Full Screen PDF</span>
                        </button>
                        <a
                          href={previewPdfUrl}
                          download={`${profile.fullName.replace(/\s+/g, '_') || 'Tutor'}_Askuala_Application.pdf`}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#166534]"
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                          <span>Download Full PDF</span>
                        </a>
                      </>
                    )}
                  </div>

                  {buildingPdf ? (
                    <div className="p-12 text-center bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
                      <p className="font-bold text-[#14532d]">
                        Building unified PDF with visible uploaded documents...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {previewPageUrls.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-[#15803d]">
                            Application Summary Pages ({previewPageUrls.length})
                          </h3>
                          <div className="space-y-4">
                            {previewPageUrls.map((src, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl overflow-hidden border-2 border-[#14532d] shadow-md bg-white"
                              >
                                <img
                                  src={src}
                                  alt={`Tutor Application Page ${idx + 1}`}
                                  className="w-full h-auto block"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {uploadedDocuments.length > 0 && (
                        <div className="p-4 rounded-xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-2">
                          <h3 className="text-sm font-bold text-[#14532d]">
                            Embedded Uploaded Academic PDFs ({uploadedDocuments.length} file
                            {uploadedDocuments.length > 1 ? 's' : ''}, included inside full PDF)
                          </h3>
                          <ul className="space-y-1 text-sm text-[#0f172a]">
                            {uploadedDocuments.map((doc) => (
                              <li key={doc.recordKey} className="font-semibold">
                                &bull; {doc.label}: {doc.filename} ({doc.pageCount} page
                                {doc.pageCount > 1 ? 's' : ''})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {previewPdfUrl && (
                        <div className="rounded-xl overflow-hidden border-2 border-[#22c55e] bg-[#f8fafc]">
                          <div className="px-4 py-2 bg-[#14532d] text-white text-xs font-bold flex items-center justify-between">
                            <span>Unified PDF Preview ({previewPagesCount} total pages)</span>
                            <span>Use Download Full PDF above if embedded viewer is restricted</span>
                          </div>
                          <iframe
                            src={previewPdfUrl}
                            title="Combined Tutor Application PDF Preview"
                            className="w-full h-[520px]"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {stepError && (
                <div
                  role="alert"
                  className="mt-5 p-3.5 rounded-xl bg-[#fef2f2] border-2 border-[#fca5a5] text-[#dc2626] text-sm font-bold flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{stepError}</span>
                </div>
              )}

              <div className="mt-6 pt-5 border-t border-[#e2e8f0] flex flex-wrap items-center justify-between gap-3 no-print">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePreviousOrExit}
                    disabled={saving}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl border-2 border-[#14532d] bg-white font-bold text-[#14532d] hover:bg-[#f0fdf4] cursor-pointer"
                  >
                    {step === 1 ? '← Exit to Home' : '← Previous'}
                  </button>
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={onExitToHome}
                      disabled={saving}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-[#22c55e] bg-[#f0fdf4] font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                    >
                      Home
                    </button>
                  )}
                </div>

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={
                      saving ||
                      isBlockedBelowGrade11 ||
                      (step === 2 && below87Violations.length > 0)
                    }
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] disabled:opacity-40 cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Next Step →'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={saving || buildingPdf}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#16a34a] text-white font-bold hover:bg-[#15803d] disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    <span>{saving ? 'Submitting...' : 'Submit Application ✓'}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full-screen PDF Preview Overlay */}
      {fullScreenPdf && previewPdfUrl && (
        <div
          className="fixed inset-0 z-[60] bg-[#14532d] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Full screen Tutor Application PDF"
        >
          <div className="px-4 py-3 bg-[#14532d] text-white border-b-2 border-[#22c55e] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setFullScreenPdf(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#14532d] font-bold text-sm hover:bg-[#f0fdf4] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to Review</span>
            </button>
            <button
              type="button"
              onClick={() => setFullScreenPdf(false)}
              aria-label="Close full screen PDF"
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#166534] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <iframe
            src={previewPdfUrl}
            title="Full Screen Tutor Application PDF"
            className="flex-1 w-full bg-white"
          />
        </div>
      )}
    </div>
  );
};
