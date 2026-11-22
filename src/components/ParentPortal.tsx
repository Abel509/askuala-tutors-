import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Lock,
  Maximize2,
  Printer,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  ADDIS_LOCATIONS,
  DAYS_OF_WEEK,
  KID_GRADE_LEVELS,
  normalizeEthiopianPhone,
  SUBJECTS,
  WEEKDAY_SLOTS,
  WEEKEND_SLOTS,
} from '../data/catalog';
import type {
  KidProfileItem,
  KidSubjectStatus,
  ParentApplication,
  ParentBudgetBracket,
  ParentProfileData,
  ParentSexPreference,
  ParentTutorPreference,
  PrivateCurriculum,
  SchoolType,
  UploadedImageDoc,
  UserAccount,
} from '../types/app';
import {
  optimizeNationalIdPhoto,
  resolveImageViewUrl,
  resolvePdfViewUrl,
  saveParentApplication,
  uploadImageFile,
  uploadPdfFile,
} from '../utils/api';
import { buildParentAmharicPdf, type PreviewPageItem } from '../utils/pdfComposer';

interface ParentPortalProps {
  user: UserAccount;
  existingApplication: ParentApplication | null;
  onApplicationUpdated: (app: ParentApplication) => void;
  onExitToHome: () => void;
}

function createEmptyKid(index: number): KidProfileItem {
  return {
    id: `kid_${index + 1}`,
    gradeLevel: '',
    selectedDays: [],
    hoursPerDay: '',
    weekdaySlots: [],
    weekendSlots: [],
    schoolType: '',
    privateCurriculum: '',
    preferredSubjects: [],
    subjectStatus: '',
  };
}

export const ParentPortal: React.FC<ParentPortalProps> = ({
  user,
  existingApplication,
  onApplicationUpdated,
  onExitToHome,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [parentProfile, setParentProfile] = useState<ParentProfileData>(() => ({
    fullName: existingApplication?.parentProfile.fullName || user.fullName || '',
    phone: existingApplication?.parentProfile.phone || user.phone || '',
    location: existingApplication?.parentProfile.location || '',
    expectedPaymentPerHour: existingApplication?.parentProfile.expectedPaymentPerHour || '',
  }));

  const [kidsCountChoice, setKidsCountChoice] = useState<'1' | '2' | '3' | 'more'>(
    existingApplication?.kidsCountChoice || '1'
  );
  const [kidsCountNumber, setKidsCountNumber] = useState<number>(
    existingApplication?.kidsCountNumber || existingApplication?.kids.length || 1
  );
  const [kids, setKids] = useState<KidProfileItem[]>(() =>
    existingApplication?.kids && existingApplication.kids.length > 0
      ? existingApplication.kids
      : [createEmptyKid(0)]
  );

  const [tutorPreference, setTutorPreference] = useState<ParentTutorPreference>(() => ({
    sex: existingApplication?.tutorPreference.sex || '',
    mode: existingApplication?.tutorPreference.mode || '',
  }));
  const [nationalIdFront, setNationalIdFront] = useState<UploadedImageDoc | undefined>(
    existingApplication?.nationalIdFront
  );
  const [nationalIdBack, setNationalIdBack] = useState<UploadedImageDoc | undefined>(
    existingApplication?.nationalIdBack
  );
  const [nationalIdThumbUrls, setNationalIdThumbUrls] = useState<{
    front?: string;
    back?: string;
  }>({});
  const [uploadingIdSide, setUploadingIdSide] = useState<'front' | 'back' | null>(null);

  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const [missingMessages, setMissingMessages] = useState<string[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfBytes, setPreviewPdfBytes] = useState<Uint8Array | null>(null);
  const [previewPageUrls, setPreviewPageUrls] = useState<string[]>([]);
  const [previewPages, setPreviewPages] = useState<PreviewPageItem[]>([]);
  const [fullScreenPdf, setFullScreenPdf] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const pageCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [agreements, setAgreements] = useState({
    accurate: false,
    phoneContact: false,
    commission: false,
    cannotEdit: false,
  });
  const isLockedSubmitted = Boolean(
    existingApplication &&
      (existingApplication.status === 'submitted' || existingApplication.status === 'matched')
  );
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(isLockedSubmitted);

  useEffect(() => {
    if (nationalIdFront?.fileId && !nationalIdThumbUrls.front) {
      resolveImageViewUrl(nationalIdFront.fileId, nationalIdFront.mimeType).then((url) => {
        if (url) setNationalIdThumbUrls((prev) => ({ ...prev, front: url }));
      });
    }
    if (nationalIdBack?.fileId && !nationalIdThumbUrls.back) {
      resolveImageViewUrl(nationalIdBack.fileId, nationalIdBack.mimeType).then((url) => {
        if (url) setNationalIdThumbUrls((prev) => ({ ...prev, back: url }));
      });
    }
  }, [
    nationalIdFront?.fileId,
    nationalIdFront?.mimeType,
    nationalIdBack?.fileId,
    nationalIdBack?.mimeType,
    nationalIdThumbUrls.front,
    nationalIdThumbUrls.back,
  ]);

  useEffect(() => {
    if (isLockedSubmitted) {
      setSubmittedSuccess(true);
      if (!previewPdfUrl && existingApplication?.summaryPdfFileId) {
        resolvePdfViewUrl(existingApplication.summaryPdfFileId).then((url) => {
          if (url) setPreviewPdfUrl(url);
        });
      }
    }
  }, [isLockedSubmitted, existingApplication?.summaryPdfFileId, previewPdfUrl]);

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

  const resizeKidsArray = (count: number) => {
    const safeCount = Math.max(1, Math.min(10, count));
    setKidsCountNumber(safeCount);
    setKids((prev) => {
      if (prev.length === safeCount) return prev;
      if (prev.length > safeCount) return prev.slice(0, safeCount);
      const next = [...prev];
      for (let i = prev.length; i < safeCount; i++) {
        next.push(createEmptyKid(i));
      }
      return next;
    });
  };

  const handleKidsChoiceChange = (choice: '1' | '2' | '3' | 'more') => {
    setKidsCountChoice(choice);
    if (choice === '1') resizeKidsArray(1);
    else if (choice === '2') resizeKidsArray(2);
    else if (choice === '3') resizeKidsArray(3);
    else resizeKidsArray(Math.max(4, kidsCountNumber));
  };

  const updateKid = (idx: number, patch: Partial<KidProfileItem>) => {
    setKids((prev) => prev.map((k, i) => (i === idx ? { ...k, ...patch } : k)));
  };

  const toggleKidArray = (
    idx: number,
    field: 'selectedDays' | 'weekdaySlots' | 'weekendSlots' | 'preferredSubjects',
    id: string
  ) => {
    clearFieldError(`kid_${idx}_${field}`);
    if (field === 'weekdaySlots' || field === 'weekendSlots') {
      clearFieldError(`kid_${idx}_schedule`);
    }
    setKids((prev) =>
      prev.map((k, i) => {
        if (i !== idx) return k;
        const arr = k[field];
        const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
        return { ...k, [field]: next };
      })
    );
  };

  const validateStep1All = (): { fields: Set<string>; messages: string[] } => {
    const fields = new Set<string>();
    const messages: string[] = [];

    if (!parentProfile.fullName.trim()) {
      fields.add('fullName');
      messages.push('ሙሉ ስምዎን ያስገቡ።');
    }
    if (!normalizeEthiopianPhone(parentProfile.phone)) {
      fields.add('phone');
      messages.push('ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (+251 / 09 / 07)።');
    }
    if (!parentProfile.location) {
      fields.add('location');
      messages.push('የሚኖሩበትን የአዲስ አበባ አካባቢ ይምረጡ።');
    }
    if (!parentProfile.expectedPaymentPerHour) {
      fields.add('expectedPaymentPerHour');
      messages.push('በሰዓት የሚከፍሉትን ክፍያ መጠን ይምረጡ።');
    }
    if (!nationalIdFront) {
      fields.add('id_front');
      messages.push('እባክዎ የብሔራዊ መታወቂያዎን የፊት ገጽ ፎቶ ይጫኑ።');
    }
    if (!nationalIdBack) {
      fields.add('id_back');
      messages.push('እባክዎ የብሔራዊ መታወቂያዎን የጀርባ ገጽ ፎቶ ይጫኑ።');
    }
    return { fields, messages };
  };

  const validateStep2All = (): { fields: Set<string>; messages: string[] } => {
    const fields = new Set<string>();
    const messages: string[] = [];

    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const num = i + 1;
      if (!k.gradeLevel) {
        fields.add(`kid_${i}_gradeLevel`);
        messages.push(`ልጅ ${num}፡ የትምህርት ደረጃ (ክፍል) ይምረጡ።`);
      }
      if (!k.hoursPerDay) {
        fields.add(`kid_${i}_hoursPerDay`);
        messages.push(`ልጅ ${num}፡ በቀን ስንት ሰዓት እንደሚያጠና ይምረጡ።`);
      }
      if (!k.schoolType) {
        fields.add(`kid_${i}_schoolType`);
        messages.push(`ልጅ ${num}፡ የትምህርት ቤቱን ዓይነት ይምረጡ።`);
      }
      if (k.schoolType === 'private' && !k.privateCurriculum) {
        fields.add(`kid_${i}_privateCurriculum`);
        messages.push(`ልጅ ${num}፡ የግል ትምህርት ቤቱን ሥርዓተ ትምህርት ይምረጡ።`);
      }
      if (k.selectedDays.length === 0) {
        fields.add(`kid_${i}_selectedDays`);
        messages.push(`ልጅ ${num}፡ ቢያንስ አንድ የጥናት ቀን ይምረጡ።`);
      } else {
        const hasWd = k.selectedDays.some((d) => d !== 'saturday' && d !== 'sunday');
        const hasWe = k.selectedDays.some((d) => d === 'saturday' || d === 'sunday');
        if (hasWd && k.weekdaySlots.length === 0) {
          fields.add(`kid_${i}_schedule`);
          messages.push(`ልጅ ${num}፡ ለመረጧቸው የሳምንቱ ቀናት የጥናት ሰዓት ይምረጡ።`);
        }
        if (hasWe && k.weekendSlots.length === 0) {
          fields.add(`kid_${i}_schedule`);
          messages.push(`ልጅ ${num}፡ ለመረጧቸው የቅዳሜ/እሑድ ቀናት የጥናት ሰዓት ይምረጡ።`);
        }
      }
      if (k.preferredSubjects.length === 0) {
        fields.add(`kid_${i}_preferredSubjects`);
        messages.push(`ልጅ ${num}፡ ቢያንስ አንድ የሚፈለግ የትምህርት ዓይነት ይምረጡ።`);
      }
      if (!k.subjectStatus) {
        fields.add(`kid_${i}_subjectStatus`);
        messages.push(`ልጅ ${num}፡ በተመረጠው ትምህርት ያለውን የአሁን ደረጃ ይምረጡ።`);
      }
    }

    return { fields, messages };
  };

  const validateStep3All = (): { fields: Set<string>; messages: string[] } => {
    const fields = new Set<string>();
    const messages: string[] = [];

    if (!tutorPreference.sex) {
      fields.add('prefSex');
      messages.push('የመምህሩን ጾታ ምርጫ ይምረጡ።');
    }
    if (!tutorPreference.mode) {
      fields.add('prefMode');
      messages.push('የማስተማሪያውን ዘዴ (በአካል ወይም በኦንላይን) ይምረጡ።');
    }
    return { fields, messages };
  };

  const resetValidation = () => {
    setMissingFields(new Set());
    setMissingMessages([]);
    setStepError(null);
  };

  const handleNationalIdUpload = async (side: 'front' | 'back', file: File | null) => {
    if (!file) return;
    setStepError(null);
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setStepError('እባክዎ ግልጽ የሆነ የብሔራዊ መታወቂያ ፎቶ (JPG ወይም PNG) ይምረጡ።');
      return;
    }
    setUploadingIdSide(side);
    try {
      const opt = await optimizeNationalIdPhoto(file);
      const uploaded = await uploadImageFile(opt.filename, opt.bytes, side, opt.mimeType);
      const entry: UploadedImageDoc = {
        side,
        fileId: uploaded.fileId,
        filename: uploaded.filename,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      };
      const thumbUrl = URL.createObjectURL(
        new Blob([new Uint8Array(opt.bytes)], { type: opt.mimeType })
      );
      if (side === 'front') {
        setNationalIdFront(entry);
        setNationalIdThumbUrls((prev) => ({ ...prev, front: thumbUrl }));
        clearFieldError('id_front');
      } else {
        setNationalIdBack(entry);
        setNationalIdThumbUrls((prev) => ({ ...prev, back: thumbUrl }));
        clearFieldError('id_back');
      }
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'የመታወቂያ ፎቶውን መጫን አልተቻለም።');
    } finally {
      setUploadingIdSide(null);
    }
  };

  const generateAmharicPdf = async () => {
    setBuildingPdf(true);
    setStepError(null);
    try {
      const { pdfBytes, previewPageUrls: urls, previewPages: items } = await buildParentAmharicPdf({
        parentProfile,
        kidsCountChoice,
        kidsCountNumber,
        kids,
        tutorPreference,
        nationalIdFront,
        nationalIdBack,
      });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      setPreviewPdfBytes(pdfBytes);
      setPreviewPageUrls(urls);
      setPreviewPages(items);
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'PDF ማዘጋጀት አልተቻለም።');
    } finally {
      setBuildingPdf(false);
    }
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
        const res = await saveParentApplication({
          parentProfile,
          kidsCountChoice,
          kidsCountNumber,
          kids,
          tutorPreference,
          nationalIdFront,
          nationalIdBack,
          submit: false,
        });
        onApplicationUpdated(res.application);
        setStep(2);
        scrollToTopOrFirstError(false);
      } catch (e) {
        setStepError(e instanceof Error ? e.message : 'መረጃውን ማስቀመጥ አልተቻለም።');
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
        const res = await saveParentApplication({
          parentProfile,
          kidsCountChoice,
          kidsCountNumber,
          kids,
          tutorPreference,
          nationalIdFront,
          nationalIdBack,
          submit: false,
        });
        onApplicationUpdated(res.application);
        setStep(3);
        scrollToTopOrFirstError(false);
      } catch (e) {
        setStepError(e instanceof Error ? e.message : 'መረጃውን ማስቀመጥ አልተቻለም።');
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
      await generateAmharicPdf();
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

  const handleFinalSubmit = async () => {
    resetValidation();
    const fields = new Set<string>();
    const messages: string[] = [];

    if (!agreements.accurate) {
      fields.add('agree_accurate');
      messages.push('ያስገቡት መረጃ በሙሉ እውነተኛ እና ትክክለኛ መሆኑን ያረጋግጡ።');
    }
    if (!agreements.phoneContact) {
      fields.add('agree_phoneContact');
      messages.push('ተስማሚ መምህር ሲገኝ በስልክ ቁጥርዎ እንደሚገናኙ የሚገልጸውን ሳጥን ይምረጡ።');
    }
    if (!agreements.commission) {
      fields.add('agree_commission');
      messages.push('መምህር ሲገኝ ኮሚሽን ለመክፈል መስማማትዎን ያረጋግጡ።');
    }
    if (!agreements.cannotEdit) {
      fields.add('agree_cannotEdit');
      messages.push('ከተላከ በኋላ ማመልከቻውን ማስተካከል እንደማይቻል የሚገልጸውን ሳጥን ይምረጡ።');
    }

    if (messages.length > 0) {
      setMissingFields(fields);
      setMissingMessages(messages);
      scrollToTopOrFirstError(true);
      return;
    }

    setSaving(true);
    setStepError(null);
    try {
      let summaryPdfFileId = existingApplication?.summaryPdfFileId;
      let summaryPdfFilename = `Parent_Application_${parentProfile.fullName.replace(/\s+/g, '_') || 'Askuala'}.pdf`;

      if (previewPdfBytes) {
        const up = await uploadPdfFile(summaryPdfFilename, previewPdfBytes);
        summaryPdfFileId = up.fileId;
        summaryPdfFilename = up.filename;
      }

      const res = await saveParentApplication({
        parentProfile,
        kidsCountChoice,
        kidsCountNumber,
        kids,
        tutorPreference,
        nationalIdFront,
        nationalIdBack,
        summaryPdfFileId,
        summaryPdfFilename,
        agreedToTerms: true,
        submit: true,
      });
      onApplicationUpdated(res.application);
      setSubmittedSuccess(true);
      scrollToTopOrFirstError(false);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'ማመልከቻውን መላክ አልተቻለም።');
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = [
    '1. የወላጅ መገለጫ',
    '2. የልጆች መገለጫ',
    '3. የመምህር ምርጫ',
    '4. PDF ማረጋገጫ እና መላኪያ',
  ];

  const isErr = (key: string) => missingFields.has(key);

  return (
    <div ref={scrollContainerRef} lang="am" className="font-amharic">
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
              <span>
                {step > 1 && !submittedSuccess
                  ? `ወደ ክፍል ${step - 1} ተመለስ`
                  : 'ወደ ዋናው ገጽ ተመለስ'}
              </span>
            </button>

            {step > 1 && !submittedSuccess && (
              <button
                type="button"
                onClick={onExitToHome}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#14532d] bg-[#f0fdf4] text-[#14532d] font-bold text-sm hover:bg-[#dcfce7] cursor-pointer"
              >
                <span>ወደ ዋናው ገጽ ውጣ</span>
              </button>
            )}
          </div>

          <div className="mb-5">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#14532d]">
              ኣስኳላ &mdash; የወላጆች መመዝገቢያ ፖርታል
            </h1>
            <p className="text-[#475569] mt-1">
              ለልጆችዎ ብቁ እና የተረጋገጡ አስጠኚዎችን ያግኙ &middot; እባክዎ አራቱንም ክፍሎች በአማርኛ ይሙሉ።
            </p>
          </div>

          <nav aria-label="የወላጅ ማመልከቻ ደረጃዎች" className="mb-6 no-print">
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
                  እባክዎ ወደ ቀጣዩ ደረጃ ከመሄድዎ በፊት የተዘለሉትን {missingMessages.length} አስፈላጊ ክፍሎች በሙሉ ይሙሉ፡
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
            <div className="py-8 text-center space-y-5">
              <CheckCircle2 className="w-16 h-16 text-[#16a34a] mx-auto" aria-hidden="true" />
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#14532d]">
                  ማመልከቻዎን ስላጠናቀቁ እንኳን ደስ አለዎት! በቅርቡ መልስ እንሰጥዎታለን።
                </h2>
                <p className="text-[#475569] max-w-xl mx-auto">
                  የቤተሰብዎ መረጃ እና የልጆችዎ የጥናት ፍላጎት ተመዝግቧል። አስተባባሪዎቻችን ከልጆችዎ ክፍል፣
                  አካባቢ እና ሰዓት ጋር የሚመጣጠን የተረጋገጠ መምህር አገናኝተው በስልክ ቁጥርዎ{' '}
                  <strong className="text-[#14532d] tabular-nums">{parentProfile.phone}</strong>{' '}
                  ያገኙዎታል።
                </p>
              </div>

              <div className="max-w-lg mx-auto p-4 rounded-xl bg-[#f0fdf4] border-2 border-[#22c55e] text-sm text-[#14532d] space-y-2">
                {existingApplication?.id && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <p className="font-bold tabular-nums">
                      የማመልከቻ መለያ ቁጥር፡{' '}
                      <span className="underline">{existingApplication.id}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(existingApplication.id).catch(() => {});
                        setCopiedRef(true);
                        window.setTimeout(() => setCopiedRef(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#14532d] text-xs font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                    >
                      {copiedRef ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#16a34a]" aria-hidden="true" />
                          <span>ተቀድቷል</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>መለያ ቁጥሩን ቅዳ</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                <p className="font-semibold flex items-center justify-center gap-1.5 text-[#15803d]">
                  <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>ማመልከቻዎ ተቆልፏል — ከተላከ በኋላ መረጃ መቀየር ወይም ማስተካከል አይቻልም።</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2 no-print">
                {previewPdfUrl && (
                  <a
                    href={previewPdfUrl}
                    download={`Askuala_Parent_${parentProfile.fullName.replace(/\s+/g, '_') || 'Application'}.pdf`}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl border-2 border-[#22c55e] text-[#14532d] font-bold inline-flex items-center gap-2 hover:bg-[#f0fdf4]"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>የማመልከቻ PDF አውርድ</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border-2 border-[#14532d] text-[#14532d] font-bold inline-flex items-center gap-2 hover:bg-[#f0fdf4] cursor-pointer"
                >
                  <Printer className="w-4 h-4" aria-hidden="true" />
                  <span>ገጹን አትም</span>
                </button>
                <button
                  type="button"
                  onClick={onExitToHome}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] cursor-pointer"
                >
                  ← ወደ ዋናው ገጽ ተመለስ
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
                      መመሪያ፡ እባክዎ ሙሉ ስምዎን፣ ትክክለኛ የኢትዮጵያ ስልክ ቁጥርዎን፣ የሚኖሩበትን አካባቢ እና በሰዓት
                      የሚከፍሉትን ክፍያ ይምረጡ።
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-field-error={isErr('fullName') ? 'true' : undefined}>
                      <label
                        htmlFor="parent-fullname"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        ሙሉ ስም *
                      </label>
                      <input
                        id="parent-fullname"
                        type="text"
                        aria-invalid={isErr('fullName')}
                        value={parentProfile.fullName}
                        onChange={(e) => {
                          clearFieldError('fullName');
                          setParentProfile({ ...parentProfile, fullName: e.target.value });
                        }}
                        placeholder="ለምሳሌ፡ አቶ ታደሰ ገብረማርያም"
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('fullName') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      />
                    </div>

                    <div data-field-error={isErr('phone') ? 'true' : undefined}>
                      <label
                        htmlFor="parent-phone"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        ስልክ ቁጥር *
                      </label>
                      <input
                        id="parent-phone"
                        type="tel"
                        aria-invalid={isErr('phone')}
                        value={parentProfile.phone}
                        onChange={(e) => {
                          clearFieldError('phone');
                          setParentProfile({ ...parentProfile, phone: e.target.value });
                        }}
                        placeholder="0911223344 ወይም +251911223344"
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white tabular-nums ${
                          isErr('phone') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      />
                    </div>

                    <div
                      className="sm:col-span-2"
                      data-field-error={isErr('location') ? 'true' : undefined}
                    >
                      <label
                        htmlFor="parent-location"
                        className="block text-sm font-bold text-[#14532d] mb-1"
                      >
                        የሚኖሩበት አካባቢ (አዲስ አበባ) *
                      </label>
                      <select
                        id="parent-location"
                        aria-invalid={isErr('location')}
                        value={parentProfile.location}
                        onChange={(e) => {
                          clearFieldError('location');
                          setParentProfile({ ...parentProfile, location: e.target.value });
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] bg-white ${
                          isErr('location') ? 'field-error' : 'border-[#cbd5e1]'
                        }`}
                      >
                        <option value="">የመኖሪያ አካባቢዎን ይምረጡ...</option>
                        {ADDIS_LOCATIONS.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.am}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <fieldset
                    data-field-error={isErr('expectedPaymentPerHour') ? 'true' : undefined}
                    className={`p-4 rounded-xl bg-[#f0fdf4] border ${
                      isErr('expectedPaymentPerHour') ? 'field-error' : 'border-[#bbf7d0]'
                    }`}
                  >
                    <legend className="text-sm font-bold text-[#14532d] mb-3">
                      በሰዓት የሚከፍሉት ክፍያ *
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(
                        [
                          { id: '400_500', label: '400 – 500 ብር' },
                          { id: 'max_600', label: 'ከ600 ብር ያልበለጠ' },
                          {
                            id: '600_700_efficiency',
                            label: 'ጥራትን እመርጣለሁ፤ 600–700 ብር ችግር የለውም',
                          },
                        ] as const
                      ).map((opt) => {
                        const selected = parentProfile.expectedPaymentPerHour === opt.id;
                        return (
                          <label
                            key={opt.id}
                            className={`p-3.5 rounded-xl border text-sm cursor-pointer font-bold ${
                              selected
                                ? 'bg-[#14532d] text-white border-[#14532d]'
                                : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="parent-budget"
                              checked={selected}
                              onChange={() => {
                                clearFieldError('expectedPaymentPerHour');
                                setParentProfile({
                                  ...parentProfile,
                                  expectedPaymentPerHour: opt.id as ParentBudgetBracket,
                                });
                              }}
                              className="sr-only"
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* የወላጅ ብሔራዊ መታወቂያ ፎቶ (የፊት እና የጀርባ ገጽ) */}
                  <div className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#14532d] space-y-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck
                        className="w-6 h-6 text-[#14532d] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-[#14532d]">
                          የብሔራዊ መታወቂያ ፎቶ (የፊት እና የጀርባ ገጽ) *
                        </h3>
                        <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
                          ለደህንነት እና ለማረጋገጫ የፋይዳ / የቀበሌ ብሔራዊ መታወቂያዎን <strong>የፊት እና የጀርባ ገጽ</strong>{' '}
                          ግልጽ ፎቶ አንስተው ይጫኑ። ሁለቱም ገጾች በማመልከቻ PDFዎ ላይ ይካተታሉ።
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(
                        [
                          {
                            side: 'front' as const,
                            title: 'የብሔራዊ መታወቂያ — የፊት ገጽ *',
                            errKey: 'id_front',
                            doc: nationalIdFront,
                            thumb: nationalIdThumbUrls.front,
                            uploadLabel: 'የፊት ገጽ ፎቶ ጫን',
                            replaceLabel: 'የፊት ገጽ ቀይር',
                          },
                          {
                            side: 'back' as const,
                            title: 'የብሔራዊ መታወቂያ — የጀርባ ገጽ *',
                            errKey: 'id_back',
                            doc: nationalIdBack,
                            thumb: nationalIdThumbUrls.back,
                            uploadLabel: 'የጀርባ ገጽ ፎቶ ጫን',
                            replaceLabel: 'የጀርባ ገጽ ቀይር',
                          },
                        ] as const
                      ).map((card) => {
                        const flagged = isErr(card.errKey);
                        const isUploading = uploadingIdSide === card.side;
                        return (
                          <div
                            key={card.side}
                            data-field-error={flagged ? 'true' : undefined}
                            className={`p-4 rounded-xl bg-white border-2 flex flex-col justify-between gap-3 ${
                              flagged ? 'field-error' : 'border-[#22c55e]'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-sm text-[#14532d]">{card.title}</p>
                                {card.doc && (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#dcfce7] text-[#14532d]">
                                    ተያይዟል ✓
                                  </span>
                                )}
                              </div>

                              {card.thumb ? (
                                <div className="rounded-lg overflow-hidden border border-[#bbf7d0] bg-[#f8fafc]">
                                  <img
                                    src={card.thumb}
                                    alt={card.title}
                                    className="w-full h-40 object-contain block mx-auto"
                                  />
                                </div>
                              ) : (
                                <div className="h-36 rounded-lg border-2 border-dashed border-[#bbf7d0] bg-[#f0fdf4] flex flex-col items-center justify-center text-center px-3 text-xs text-[#475569]">
                                  <Camera
                                    className="w-6 h-6 text-[#15803d] mb-1.5"
                                    aria-hidden="true"
                                  />
                                  <span>እስካሁን ፎቶ አልተጫነም</span>
                                </div>
                              )}

                              {card.doc && (
                                <p className="text-xs text-[#15803d] font-semibold truncate">
                                  {card.doc.filename} ({Math.round(card.doc.sizeBytes / 1024)} KB)
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <label className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#14532d] text-white text-xs sm:text-sm font-bold hover:bg-[#166534] inline-flex items-center justify-center gap-1.5 cursor-pointer">
                                <Camera className="w-4 h-4" aria-hidden="true" />
                                <span>
                                  {isUploading
                                    ? 'በመጫን ላይ...'
                                    : card.doc
                                    ? card.replaceLabel
                                    : card.uploadLabel}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) =>
                                    handleNationalIdUpload(card.side, e.target.files?.[0] || null)
                                  }
                                />
                              </label>

                              {card.doc && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (card.side === 'front') {
                                      setNationalIdFront(undefined);
                                      setNationalIdThumbUrls((prev) => ({
                                        ...prev,
                                        front: undefined,
                                      }));
                                    } else {
                                      setNationalIdBack(undefined);
                                      setNationalIdThumbUrls((prev) => ({
                                        ...prev,
                                        back: undefined,
                                      }));
                                    }
                                  }}
                                  aria-label={`${card.title} አጥፋ`}
                                  className="min-h-[40px] px-3 py-2 rounded-xl border border-[#fca5a5] bg-white text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer"
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
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="instruction-box">
                    <span>📚</span>
                    <span>
                      መመሪያ፡ ስንት ልጆች እንዲማሩ እንደሚፈልጉ ሲመርጡ ለእያንዳንዱ ልጅ የመሙያ ቅጽ በራሱ ይከፈታል።
                    </span>
                  </div>

                  <fieldset className="p-4 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0]">
                    <legend className="text-sm font-bold text-[#14532d] mb-3">
                      ስንት ልጆች አሉዎት? *
                    </legend>
                    <div className="flex flex-wrap items-center gap-3">
                      {(
                        [
                          { id: '1', label: '1 ልጅ' },
                          { id: '2', label: '2 ልጆች' },
                          { id: '3', label: '3 ልጆች' },
                          { id: 'more', label: 'ከ3 በላይ' },
                        ] as const
                      ).map((c) => {
                        const active = kidsCountChoice === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleKidsChoiceChange(c.id)}
                            className={`min-h-[44px] px-4 py-2 rounded-xl border text-sm font-bold cursor-pointer ${
                              active
                                ? 'bg-[#14532d] text-white border-[#14532d]'
                                : 'bg-white text-[#14532d] border-[#22c55e] hover:bg-[#dcfce7]'
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}

                      {kidsCountChoice === 'more' && (
                        <div className="flex items-center gap-2 ml-2">
                          <label
                            htmlFor="kids-exact-count"
                            className="text-sm font-bold text-[#14532d]"
                          >
                            ብዛት ይጻፉ፡
                          </label>
                          <input
                            id="kids-exact-count"
                            type="number"
                            min={4}
                            max={10}
                            value={kidsCountNumber}
                            onChange={(e) => resizeKidsArray(Number(e.target.value) || 4)}
                            className="w-20 min-h-[40px] px-3 py-1.5 rounded-lg border border-[#22c55e] bg-white tabular-nums"
                          />
                        </div>
                      )}
                    </div>
                  </fieldset>

                  <div className="space-y-6" aria-live="polite">
                    {kids.map((kid, idx) => {
                      const hasWeekday = kid.selectedDays.some(
                        (d) => d !== 'saturday' && d !== 'sunday'
                      );
                      const hasWeekend = kid.selectedDays.some(
                        (d) => d === 'saturday' || d === 'sunday'
                      );
                      return (
                        <section
                          key={kid.id}
                          aria-labelledby={`kid-heading-${idx}`}
                          className="p-5 rounded-2xl bg-[#f8fafc] border-2 border-[#22c55e] space-y-5"
                        >
                          <div className="flex items-center justify-between border-b border-[#bbf7d0] pb-2">
                            <h3
                              id={`kid-heading-${idx}`}
                              className="text-xl font-bold text-[#14532d]"
                            >
                              ልጅ {idx + 1} &mdash; የትምህርት እና የጥናት መረጃ
                            </h3>
                            <span className="text-xs font-bold text-[#15803d] tabular-nums">
                              {idx + 1} / {kids.length}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div data-field-error={isErr(`kid_${idx}_gradeLevel`) ? 'true' : undefined}>
                              <label
                                htmlFor={`kid-${idx}-grade`}
                                className="block text-sm font-bold text-[#14532d] mb-1"
                              >
                                የተማሪው ክፍል *
                              </label>
                              <select
                                id={`kid-${idx}-grade`}
                                aria-invalid={isErr(`kid_${idx}_gradeLevel`)}
                                value={kid.gradeLevel}
                                onChange={(e) => {
                                  clearFieldError(`kid_${idx}_gradeLevel`);
                                  updateKid(idx, { gradeLevel: e.target.value });
                                }}
                                className={`w-full min-h-[44px] px-3 py-2 rounded-lg border-[1.5px] bg-white ${
                                  isErr(`kid_${idx}_gradeLevel`)
                                    ? 'field-error'
                                    : 'border-[#cbd5e1]'
                                }`}
                              >
                                <option value="">ክፍል ይምረጡ...</option>
                                {KID_GRADE_LEVELS.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.am}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div
                              data-field-error={isErr(`kid_${idx}_hoursPerDay`) ? 'true' : undefined}
                            >
                              <label
                                htmlFor={`kid-${idx}-hours`}
                                className="block text-sm font-bold text-[#14532d] mb-1"
                              >
                                በቀን ስንት ሰዓት? *
                              </label>
                              <select
                                id={`kid-${idx}-hours`}
                                aria-invalid={isErr(`kid_${idx}_hoursPerDay`)}
                                value={kid.hoursPerDay}
                                onChange={(e) => {
                                  clearFieldError(`kid_${idx}_hoursPerDay`);
                                  updateKid(idx, {
                                    hoursPerDay: e.target.value as '1' | '2' | '3' | '',
                                  });
                                }}
                                className={`w-full min-h-[44px] px-3 py-2 rounded-lg border-[1.5px] bg-white ${
                                  isErr(`kid_${idx}_hoursPerDay`)
                                    ? 'field-error'
                                    : 'border-[#cbd5e1]'
                                }`}
                              >
                                <option value="">ሰዓት ይምረጡ...</option>
                                <option value="1">1 ሰዓት</option>
                                <option value="2">2 ሰዓት</option>
                                <option value="3">3 ሰዓት</option>
                              </select>
                            </div>

                            <div data-field-error={isErr(`kid_${idx}_schoolType`) ? 'true' : undefined}>
                              <label
                                htmlFor={`kid-${idx}-school`}
                                className="block text-sm font-bold text-[#14532d] mb-1"
                              >
                                የትምህርት ቤት ዓይነት *
                              </label>
                              <select
                                id={`kid-${idx}-school`}
                                aria-invalid={isErr(`kid_${idx}_schoolType`)}
                                value={kid.schoolType}
                                onChange={(e) => {
                                  clearFieldError(`kid_${idx}_schoolType`);
                                  updateKid(idx, {
                                    schoolType: e.target.value as SchoolType | '',
                                    privateCurriculum:
                                      e.target.value === 'private' ? kid.privateCurriculum : '',
                                  });
                                }}
                                className={`w-full min-h-[44px] px-3 py-2 rounded-lg border-[1.5px] bg-white ${
                                  isErr(`kid_${idx}_schoolType`)
                                    ? 'field-error'
                                    : 'border-[#cbd5e1]'
                                }`}
                              >
                                <option value="">ይምረጡ...</option>
                                <option value="government">የመንግሥት ትምህርት ቤት</option>
                                <option value="private">የግል ትምህርት ቤት</option>
                              </select>
                            </div>
                          </div>

                          {kid.schoolType === 'private' && (
                            <div
                              data-field-error={
                                isErr(`kid_${idx}_privateCurriculum`) ? 'true' : undefined
                              }
                              className={`p-3.5 rounded-xl bg-white border-2 ${
                                isErr(`kid_${idx}_privateCurriculum`)
                                  ? 'field-error'
                                  : 'border-[#16a34a]'
                              }`}
                            >
                              <p className="text-sm font-bold text-[#14532d] mb-2">
                                የግል ትምህርት ቤቱ ሥርዓተ ትምህርት ምንድን ነው? *
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {(
                                  [
                                    {
                                      id: 'standard',
                                      label: 'መደበኛ የኢትዮጵያ ሥርዓተ ትምህርት',
                                    },
                                    {
                                      id: 'international',
                                      label: 'ዓለም አቀፍ ሥርዓተ ትምህርት',
                                    },
                                  ] as const
                                ).map((curr) => {
                                  const selected = kid.privateCurriculum === curr.id;
                                  return (
                                    <label
                                      key={curr.id}
                                      className={`px-3.5 py-2.5 rounded-xl border text-sm cursor-pointer font-bold ${
                                        selected
                                          ? 'bg-[#14532d] text-white border-[#14532d]'
                                          : 'bg-[#f0fdf4] text-[#14532d] border-[#bbf7d0]'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`kid-${idx}-curriculum`}
                                        checked={selected}
                                        onChange={() => {
                                          clearFieldError(`kid_${idx}_privateCurriculum`);
                                          updateKid(idx, {
                                            privateCurriculum: curr.id as PrivateCurriculum,
                                          });
                                        }}
                                        className="sr-only"
                                      />
                                      <span>{curr.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <fieldset
                            data-field-error={
                              isErr(`kid_${idx}_selectedDays`) ? 'true' : undefined
                            }
                            className={`rounded-xl p-2 ${
                              isErr(`kid_${idx}_selectedDays`) ? 'field-error' : ''
                            }`}
                          >
                            <legend className="text-sm font-bold text-[#14532d] mb-2">
                              የጥናት ቀናትን ይምረጡ *
                            </legend>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                              {DAYS_OF_WEEK.map((day) => {
                                const checked = kid.selectedDays.includes(day.id);
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
                                      onChange={() => toggleKidArray(idx, 'selectedDays', day.id)}
                                      className="sr-only"
                                    />
                                    <span>{day.am}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>

                          {kid.selectedDays.length > 0 && (
                            <div
                              data-field-error={isErr(`kid_${idx}_schedule`) ? 'true' : undefined}
                              className={`grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl ${
                                isErr(`kid_${idx}_schedule`) ? 'field-error p-2' : ''
                              }`}
                            >
                              {hasWeekday && (
                                <fieldset className="p-3.5 rounded-xl bg-white border border-[#bbf7d0]">
                                  <legend className="text-sm font-bold text-[#14532d] mb-2">
                                    የሳምንቱ ቀናት ሰዓት (በኢትዮጵያ አቆጣጠር) *
                                  </legend>
                                  <div className="space-y-2">
                                    {WEEKDAY_SLOTS.map((slot) => {
                                      const checked = kid.weekdaySlots.includes(slot.id);
                                      return (
                                        <label
                                          key={slot.id}
                                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs sm:text-sm cursor-pointer font-semibold tabular-nums ${
                                            checked
                                              ? 'bg-[#14532d] text-white border-[#14532d]'
                                              : 'bg-[#f0fdf4] text-[#0f172a] border-[#cbd5e1]'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              toggleKidArray(idx, 'weekdaySlots', slot.id)
                                            }
                                            className="sr-only"
                                          />
                                          <span>{slot.am}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </fieldset>
                              )}

                              {hasWeekend && (
                                <fieldset className="p-3.5 rounded-xl bg-white border border-[#bbf7d0]">
                                  <legend className="text-sm font-bold text-[#14532d] mb-2">
                                    የቅዳሜ እና እሑድ ሰዓት (በኢትዮጵያ አቆጣጠር) *
                                  </legend>
                                  <div className="grid grid-cols-2 gap-2">
                                    {WEEKEND_SLOTS.map((slot) => {
                                      const checked = kid.weekendSlots.includes(slot.id);
                                      return (
                                        <label
                                          key={slot.id}
                                          className={`flex items-center justify-center px-2.5 py-2 rounded-lg border text-xs cursor-pointer font-semibold tabular-nums ${
                                            checked
                                              ? 'bg-[#14532d] text-white border-[#14532d]'
                                              : 'bg-[#f0fdf4] text-[#0f172a] border-[#cbd5e1]'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              toggleKidArray(idx, 'weekendSlots', slot.id)
                                            }
                                            className="sr-only"
                                          />
                                          <span>{slot.am}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </fieldset>
                              )}
                            </div>
                          )}

                          <fieldset
                            data-field-error={
                              isErr(`kid_${idx}_preferredSubjects`) ? 'true' : undefined
                            }
                            className={`rounded-xl p-2 ${
                              isErr(`kid_${idx}_preferredSubjects`) ? 'field-error' : ''
                            }`}
                          >
                            <legend className="text-sm font-bold text-[#14532d] mb-2">
                              ልጁ እንዲማራቸው የሚፈለጉ ትምህርቶች * ({kid.preferredSubjects.length}{' '}
                              ተመርጠዋል)
                            </legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {SUBJECTS.map((subj) => {
                                const checked = kid.preferredSubjects.includes(subj.id);
                                return (
                                  <label
                                    key={subj.id}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer font-semibold ${
                                      checked
                                        ? 'bg-[#14532d] text-white border-[#14532d]'
                                        : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleKidArray(idx, 'preferredSubjects', subj.id)
                                      }
                                      className="sr-only"
                                    />
                                    <span>{subj.am}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>

                          <fieldset
                            data-field-error={
                              isErr(`kid_${idx}_subjectStatus`) ? 'true' : undefined
                            }
                            className={`rounded-xl p-2 ${
                              isErr(`kid_${idx}_subjectStatus`) ? 'field-error' : ''
                            }`}
                          >
                            <legend className="text-sm font-bold text-[#14532d] mb-2">
                              በተመረጡት ትምህርቶች የልጁ አሁናዊ ደረጃ *
                            </legend>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {(
                                [
                                  { id: 'basic', label: 'መሠረታዊ (እገዛ የሚፈልግ)' },
                                  { id: 'medium', label: 'መካከለኛ' },
                                  { id: 'advanced', label: 'ከፍተኛ (የላቀ ውጤት)' },
                                ] as const
                              ).map((st) => {
                                const selected = kid.subjectStatus === st.id;
                                return (
                                  <label
                                    key={st.id}
                                    className={`px-3.5 py-2.5 rounded-xl border text-sm text-center cursor-pointer font-bold ${
                                      selected
                                        ? 'bg-[#14532d] text-white border-[#14532d]'
                                        : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`kid-${idx}-status`}
                                      checked={selected}
                                      onChange={() => {
                                        clearFieldError(`kid_${idx}_subjectStatus`);
                                        updateKid(idx, {
                                          subjectStatus: st.id as KidSubjectStatus,
                                        });
                                      }}
                                      className="sr-only"
                                    />
                                    <span>{st.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="instruction-box">
                    <span>👩‍🏫</span>
                    <span>
                      መመሪያ፡ ለልጆችዎ የሚመቹትን የመምህር ጾታ እና የማስተማሪያ ዘዴ (በአካል ወይም በኦንላይን) ይምረጡ።
                    </span>
                  </div>

                  <fieldset
                    data-field-error={isErr('prefSex') ? 'true' : undefined}
                    className={`p-4 rounded-xl bg-[#f0fdf4] border ${
                      isErr('prefSex') ? 'field-error' : 'border-[#bbf7d0]'
                    }`}
                  >
                    <legend className="text-sm font-bold text-[#14532d] mb-3">
                      የመምህር ጾታ ምርጫ *
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(
                        [
                          { id: 'male', label: 'ወንድ መምህር' },
                          { id: 'female', label: 'ሴት መምህር' },
                          { id: 'any', label: 'ምንም ችግር የለውም (ሁለቱም)' },
                        ] as const
                      ).map((opt) => {
                        const selected = tutorPreference.sex === opt.id;
                        return (
                          <label
                            key={opt.id}
                            className={`p-3.5 rounded-xl border text-sm text-center cursor-pointer font-bold ${
                              selected
                                ? 'bg-[#14532d] text-white border-[#14532d]'
                                : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pref-sex"
                              checked={selected}
                              onChange={() => {
                                clearFieldError('prefSex');
                                setTutorPreference({
                                  ...tutorPreference,
                                  sex: opt.id as ParentSexPreference,
                                });
                              }}
                              className="sr-only"
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset
                    data-field-error={isErr('prefMode') ? 'true' : undefined}
                    className={`p-4 rounded-xl bg-[#f0fdf4] border ${
                      isErr('prefMode') ? 'field-error' : 'border-[#bbf7d0]'
                    }`}
                  >
                    <legend className="text-sm font-bold text-[#14532d] mb-3">
                      የማስተማሪያ ዘዴ *
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          { id: 'in_person', label: 'በአካል (ቤት ድረስ መጥቶ ማስተማር)' },
                          { id: 'online', label: 'በኦንላይን (በኢንተርኔት)' },
                        ] as const
                      ).map((opt) => {
                        const selected = tutorPreference.mode === opt.id;
                        return (
                          <label
                            key={opt.id}
                            className={`p-4 rounded-xl border text-sm text-center cursor-pointer font-bold ${
                              selected
                                ? 'bg-[#14532d] text-white border-[#14532d]'
                                : 'bg-white text-[#0f172a] border-[#cbd5e1]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pref-mode"
                              checked={selected}
                              onChange={() => {
                                clearFieldError('prefMode');
                                setTutorPreference({
                                  ...tutorPreference,
                                  mode: opt.id as 'online' | 'in_person',
                                });
                              }}
                              className="sr-only"
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="instruction-box no-print">
                    <span>📄</span>
                    <span>
                      መመሪያ፡ ያስገቡትን መረጃ በPDF ማጠቃለያው ላይ ያረጋግጡ፣ PDF ያውርዱ ከዚያ «ማመልከቻውን ላክ»
                      የሚለውን ይጫኑ።
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 no-print">
                    <button
                      type="button"
                      onClick={generateAmharicPdf}
                      disabled={buildingPdf}
                      className="min-h-[40px] px-4 py-2 rounded-xl border border-[#22c55e] text-[#14532d] text-sm font-bold hover:bg-[#f0fdf4] cursor-pointer"
                    >
                      {buildingPdf ? 'በማዘጋጀት ላይ...' : 'PDF አድስ'}
                    </button>
                    {previewPdfUrl && (
                      <>
                        <button
                          type="button"
                          onClick={() => setFullScreenPdf(true)}
                          className="min-h-[40px] px-4 py-2 rounded-xl border border-[#14532d] text-[#14532d] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                        >
                          <Maximize2 className="w-4 h-4" aria-hidden="true" />
                          <span>ሙሉ ገጽ ክፈት</span>
                        </button>
                        <a
                          href={previewPdfUrl}
                          download={`Askuala_Parent_${parentProfile.fullName.replace(/\s+/g, '_') || 'Application'}.pdf`}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#166534]"
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                          <span>PDF አውርድ</span>
                        </a>
                      </>
                    )}
                  </div>

                  {buildingPdf ? (
                    <div className="p-12 text-center bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
                      <p className="font-bold text-[#14532d]">
                        የአማርኛ ማመልከቻ PDF በመዘጋጀት ላይ ነው...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {(previewPages.length > 0 || previewPageUrls.length > 0) && (
                        <div className="space-y-4">
                          {previewPages.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-[#f0fdf4] border border-[#22c55e] space-y-2 no-print">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-[#14532d]">
                                  የወላጅ ማመልከቻ ገጾች ({previewPages.length} የሚታዩ ገጾች)
                                </h3>
                                <span className="text-xs text-[#15803d] font-semibold">
                                  በቀጥታ ለመሄድ ገጹን ይጫኑ
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {previewPages.map((pg, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() =>
                                      pageCardRefs.current[idx]?.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'start',
                                      })
                                    }
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                                      pg.kind === 'national_id'
                                        ? 'bg-[#14532d] text-white border-[#14532d]'
                                        : 'bg-[#dcfce7] text-[#14532d] border-[#22c55e] hover:bg-[#bbf7d0]'
                                    }`}
                                  >
                                    ገጽ {idx + 1}:{' '}
                                    {pg.kind === 'national_id' ? 'ብሔራዊ መታወቂያ' : 'ማጠቃለያ'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-5">
                            {(previewPages.length > 0
                              ? previewPages
                              : previewPageUrls.map((url, i) => ({
                                  url,
                                  caption: `የወላጅ ማመልከቻ ገጽ ${i + 1}`,
                                  kind: 'summary' as const,
                                }))
                            ).map((pg, idx, arr) => (
                              <div
                                key={idx}
                                ref={(el) => {
                                  pageCardRefs.current[idx] = el;
                                }}
                                className="rounded-xl overflow-hidden border-2 border-[#14532d] shadow-md bg-white"
                              >
                                <div className="px-4 py-2.5 bg-[#f0fdf4] border-b border-[#bbf7d0] flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#14532d]">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-[#14532d] text-white text-[10px]">
                                      {pg.kind === 'national_id' ? 'ብሔራዊ መታወቂያ' : 'ማጠቃለያ'}
                                    </span>
                                    <span>{pg.caption}</span>
                                  </div>
                                  <span className="tabular-nums">
                                    ገጽ {idx + 1} / {arr.length}
                                  </span>
                                </div>
                                <img src={pg.url} alt={pg.caption} className="w-full h-auto block" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* የግዴታ የወላጅ ስምምነት እና ማረጋገጫ */}
                      <fieldset className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#14532d] space-y-3 no-print">
                        <legend className="text-base font-bold text-[#14532d] px-1">
                          የወላጅ የግዴታ ስምምነት እና ማረጋገጫ *
                        </legend>
                        <p className="text-xs text-[#475569]">
                          እባክዎ ማመልከቻውን ከመላክዎ በፊት የሚከተሉትን 4 ነጥቦች በሙሉ ያንብቡና ምልክት ያድርጉ፡
                        </p>

                        {(
                          [
                            {
                              key: 'accurate' as const,
                              errKey: 'agree_accurate',
                              text: 'ያስገባሁት መረጃ በሙሉ እውነተኛ እና ትክክለኛ መሆኑን አረጋግጣለሁ።',
                            },
                            {
                              key: 'phoneContact' as const,
                              errKey: 'agree_phoneContact',
                              text: 'ተስማሚ መምህር ሲገኝ በገባሁት ስልክ ቁጥር እንደሚደወልልኝ እና እንደምገናኝ ተረድቻለሁ።',
                            },
                            {
                              key: 'commission' as const,
                              errKey: 'agree_commission',
                              text: 'መምህር ሲገኝልኝ የሚጠበቀውን የአገልግሎት ኮሚሽን ለመክፈል እስማማለሁ።',
                            },
                            {
                              key: 'cannotEdit' as const,
                              errKey: 'agree_cannotEdit',
                              text: 'ማመልከቻውን አንዴ ከላክሁ በኋላ መረጃውን ማስተካከል ወይም መቀየር እንደማልችል ተረድቻለሁ።',
                            },
                          ] as const
                        ).map((item) => {
                          const checked = agreements[item.key];
                          const flagged = isErr(item.errKey);
                          return (
                            <label
                              key={item.key}
                              data-field-error={flagged ? 'true' : undefined}
                              className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
                                flagged
                                  ? 'field-error bg-[#fef2f2]'
                                  : checked
                                  ? 'bg-white border-[#16a34a]'
                                  : 'bg-white border-[#cbd5e1] hover:border-[#22c55e]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  clearFieldError(item.errKey);
                                  setAgreements((prev) => ({
                                    ...prev,
                                    [item.key]: e.target.checked,
                                  }));
                                }}
                                className="mt-0.5 w-5 h-5 accent-[#14532d] shrink-0 cursor-pointer"
                              />
                              <span className="text-sm font-bold text-[#0f172a]">
                                {item.text}
                              </span>
                            </label>
                          );
                        })}
                      </fieldset>
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
                    {step === 1 ? '← ወደ ዋናው ገጽ ውጣ' : '← ወደ ኋላ ተመለስ'}
                  </button>
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={onExitToHome}
                      disabled={saving}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-[#22c55e] bg-[#f0fdf4] font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                    >
                      ዋና ገጽ
                    </button>
                  )}
                </div>

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={saving}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] disabled:opacity-40 cursor-pointer"
                  >
                    {saving ? 'በማስቀመጥ ላይ...' : 'ቀጣይ ደረጃ →'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={saving || buildingPdf}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#16a34a] text-white font-bold hover:bg-[#15803d] disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    <span>{saving ? 'በመላክ ላይ...' : 'ማመልከቻውን ላክ ✓'}</span>
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
          aria-label="የወላጅ ማመልከቻ PDF ሙሉ ገጽ"
        >
          <div className="px-4 py-3 bg-[#14532d] text-white border-b-2 border-[#22c55e] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setFullScreenPdf(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#14532d] font-bold text-sm hover:bg-[#f0fdf4] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>ወደ ቅድመ እይታ ተመለስ</span>
            </button>
            <button
              type="button"
              onClick={() => setFullScreenPdf(false)}
              aria-label="ዝጋ"
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#166534] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#f0fdf4] p-4 sm:p-6 space-y-4">
            {previewPageUrls.length > 0 ? (
              <div className="max-w-4xl mx-auto space-y-4">
                {previewPageUrls.map((src, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl overflow-hidden border-2 border-[#14532d] shadow-md bg-white"
                  >
                    <img
                      src={src}
                      alt={`የወላጅ ማመልከቻ ገጽ ${idx + 1}`}
                      className="w-full h-auto block"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <iframe
                src={previewPdfUrl}
                title="የወላጅ ማመልከቻ PDF"
                className="w-full h-full min-h-[75vh] bg-white rounded-xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
