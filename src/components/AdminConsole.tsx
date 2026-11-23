import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Handshake,
  ImagePlus,
  KeyRound,
  Lock,
  PhoneCall,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlink,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  ADDIS_LOCATIONS,
  DAYS_OF_WEEK,
  EDUCATION_LEVEL_LABELS,
  formatEsslceLabel,
  formatFeeTierLabel,
  KID_GRADE_LEVELS,
  SUBJECTS,
  WEEKDAY_SLOTS,
  WEEKEND_SLOTS,
} from '../data/catalog';
import {
  changeOwnerPasscode,
  createAdminMatch,
  deleteAdminParent,
  deleteAdminTutor,
  downloadSingleHtml,
  fetchAdminOverview,
  getPdfBytes,
  isStandaloneFileMode,
  quickConfirmAdminMatch,
  resetAdminUserPassword,
  resolvePdfViewUrl,
  unlockOwnerWithPasscode,
  unmatchAdminMatch,
  updateTutorAdminStatus,
  type AuthResponse,
} from '../utils/api';
import { renderPdfBytesToPngUrls, type PreviewPageItem } from '../utils/pdfComposer';
import {
  rankParentsForTutorCriteria,
  rankTutorsForParentCriteria,
  type OwnerParentSearchCriteria,
  type OwnerTutorInquiryCriteria,
  type RankedParentMatch,
  type RankedTutorMatch,
  type RequiredTutorEducation,
} from '../utils/tutorMatcher';
import type {
  AdminParentItem,
  AdminTutorItem,
  MatchRecord,
  SiteMode,
  TutorApplication,
  UserAccount,
} from '../types/app';

interface AdminConsoleProps {
  user: UserAccount | null;
  siteMode?: SiteMode;
  onAuthenticatedAdmin?: (res: AuthResponse) => void;
  onHeroUpdated?: () => void;
  onBackHome: () => void;
}

type AdminTab = 'parents' | 'tutors' | 'suggested' | 'matches' | 'finder' | 'settings';

const DEFAULT_FINDER_CRITERIA: OwnerParentSearchCriteria = {
  parentName: '',
  parentPhone: '',
  requiredEducationLevel: 'any',
  schoolCurriculum: 'any',
  minExperience: 'any',
  location: 'any',
  mode: 'in_person',
  sexPreference: 'any',
  feeBudget: 'any',
  kidsCount: 1,
  gradeLevels: [],
  subjects: [],
  selectedDays: [],
  minDaysPerWeek: 0,
  hoursPerDay: 'any',
  weekdaySlots: [],
  weekendSlots: [],
  verifiedOnly: false,
  excludeMatched: true,
};

const DEFAULT_TUTOR_INQUIRY_CRITERIA: OwnerTutorInquiryCriteria = {
  tutorName: '',
  tutorPhone: '',
  educationLevel: 'college',
  sex: 'female',
  mode: 'both',
  expectedFeePerHour: '400_600',
  priorExperience: '1_year',
  preferredLocations: [],
  subjects: [],
  daysPerWeek: 0,
  selectedDays: [],
  hoursPerDay: 'any',
  weekdaySlots: [],
  weekendSlots: [],
  excludeMatched: true,
};

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  user,
  onAuthenticatedAdmin,
  onHeroUpdated,
  onBackHome,
}) => {
  const [unlockedLocally, setUnlockedLocally] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // 6 owner sections
  const [tab, setTab] = useState<AdminTab>('parents');
  const [tutors, setTutors] = useState<AdminTutorItem[]>([]);
  const [parents, setParents] = useState<AdminParentItem[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Two-Way Phone/Walk-in Perfect Match Search State
  const [finderMode, setFinderMode] = useState<'for_parent' | 'for_tutor' | ''>('');
  const [finderDraft, setFinderDraft] = useState<OwnerParentSearchCriteria>(DEFAULT_FINDER_CRITERIA);
  const [appliedCriteria, setAppliedCriteria] = useState<OwnerParentSearchCriteria | null>(null);
  const [finderWarning, setFinderWarning] = useState<string | null>(null);
  const [confirmingFinderTutorId, setConfirmingFinderTutorId] = useState<string | null>(null);

  const [tutorInquiryDraft, setTutorInquiryDraft] = useState<OwnerTutorInquiryCriteria>(
    DEFAULT_TUTOR_INQUIRY_CRITERIA
  );
  const [appliedTutorInquiry, setAppliedTutorInquiry] =
    useState<OwnerTutorInquiryCriteria | null>(null);
  const [tutorInquiryWarning, setTutorInquiryWarning] = useState<string | null>(null);
  const [confirmingParentId, setConfirmingParentId] = useState<string | null>(null);

  // Filters
  const [tutorFilter, setTutorFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [parentSearchQuery, setParentSearchQuery] = useState('');

  // Applicant password visibility, reset & permanent delete confirmation
  const [revealedPwIds, setRevealedPwIds] = useState<Set<string>>(new Set());
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPwDraft, setResetPwDraft] = useState('');
  const [savingUserReset, setSavingUserReset] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Editable Owner Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showEditPws, setShowEditPws] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [downloadingSingle, setDownloadingSingle] = useState(false);

  // Hero Picture customizer
  const [heroNotice, setHeroNotice] = useState<string | null>(null);
  const [hasCustomHero, setHasCustomHero] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('askuala_custom_hero'));
    } catch {
      return false;
    }
  });

  // Full-screen PDF modal
  const [inspectPdfUrl, setInspectPdfUrl] = useState<string | null>(null);
  const [inspectPdfTitle, setInspectPdfTitle] = useState<string>('');
  const [inspectPdfPages, setInspectPdfPages] = useState<PreviewPageItem[]>([]);
  const [loadingPdfPages, setLoadingPdfPages] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedTutorId, setSelectedTutorId] = useState<string>('');

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleRevealPassword = (userId: string) => {
    setRevealedPwIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const openPdfInspector = async (fileId: string, title: string) => {
    const url = await resolvePdfViewUrl(fileId);
    if (!url) return;
    setInspectPdfTitle(title);
    setInspectPdfUrl(url);
    setInspectPdfPages([]);
    setLoadingPdfPages(true);
    try {
      const bytes = await getPdfBytes(fileId);
      if (bytes) {
        const pages = await renderPdfBytesToPngUrls(bytes, title);
        setInspectPdfPages(pages);
      }
    } finally {
      setLoadingPdfPages(false);
    }
  };

  const isAuthorized = user?.role === 'admin' || unlockedLocally;

  // Exclude drafts completely on the client as a second layer of safety
  const submittedTutors = useMemo(
    () => tutors.filter((t) => t.status !== 'draft' && Boolean(t.submittedAt)),
    [tutors]
  );
  const submittedParents = useMemo(
    () => parents.filter((p) => p.status !== 'draft'),
    [parents]
  );

  const confirmedMatches = useMemo(
    () => matches.filter((m) => m.status === 'confirmed'),
    [matches]
  );
  const suggestedMatches = useMemo(
    () => matches.filter((m) => m.status !== 'confirmed'),
    [matches]
  );

  const confirmedTutorIds = useMemo(
    () => new Set(confirmedMatches.map((m) => m.tutorAppId)),
    [confirmedMatches]
  );
  const confirmedParentIds = useMemo(
    () => new Set(confirmedMatches.map((m) => m.parentAppId)),
    [confirmedMatches]
  );

  const activeTutors = useMemo(
    () => submittedTutors.filter((t) => !confirmedTutorIds.has(t.id)),
    [submittedTutors, confirmedTutorIds]
  );
  const activeParents = useMemo(
    () => submittedParents.filter((p) => !confirmedParentIds.has(p.id) && p.status !== 'matched'),
    [submittedParents, confirmedParentIds]
  );

  const finderResults: RankedTutorMatch[] = useMemo(() => {
    if (!appliedCriteria) return [];
    return rankTutorsForParentCriteria(submittedTutors, confirmedTutorIds, appliedCriteria);
  }, [submittedTutors, confirmedTutorIds, appliedCriteria]);

  const parentFinderResults: RankedParentMatch[] = useMemo(() => {
    if (!appliedTutorInquiry) return [];
    return rankParentsForTutorCriteria(
      submittedParents,
      confirmedParentIds,
      appliedTutorInquiry
    );
  }, [submittedParents, confirmedParentIds, appliedTutorInquiry]);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOverview();
      setTutors(res.tutors);
      setParents(res.parents);
      setMatches(res.matches);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load coordinator console');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadOverview();
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (activeParents.length === 0) {
      setSelectedParentId('');
    } else if (!activeParents.some((p) => p.id === selectedParentId)) {
      setSelectedParentId(activeParents[0].id);
    }
  }, [activeParents, selectedParentId]);

  useEffect(() => {
    if (activeTutors.length === 0) {
      setSelectedTutorId('');
    } else if (!activeTutors.some((t) => t.id === selectedTutorId)) {
      setSelectedTutorId(activeTutors[0].id);
    }
  }, [activeTutors, selectedTutorId]);

  const toggleFinderArray = (
    field: 'gradeLevels' | 'subjects' | 'selectedDays' | 'weekdaySlots' | 'weekendSlots',
    id: string
  ) => {
    const already = finderDraft[field].includes(id);
    if (field === 'selectedDays' && !already && finderDraft.minDaysPerWeek > 0) {
      if (finderDraft.selectedDays.length >= finderDraft.minDaysPerWeek) {
        setFinderWarning(
          `Blocked: You selected ${finderDraft.minDaysPerWeek} day(s) per week. Raise "Days per Week Needed" first to pick more days.`
        );
        return;
      }
    }
    if (
      (field === 'weekdaySlots' || field === 'weekendSlots') &&
      !already &&
      finderDraft.hoursPerDay !== 'any'
    ) {
      const cap = Number(finderDraft.hoursPerDay);
      if (finderDraft[field].length >= cap) {
        setFinderWarning(
          `Blocked: You selected ${cap} hour(s) per day. Change "Hours per Day" first to pick more slots.`
        );
        return;
      }
    }
    setFinderWarning(null);
    setFinderDraft((prev) => {
      const arr = prev[field];
      const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
      return { ...prev, [field]: next };
    });
  };

  const toggleTutorInquiryArray = (
    field:
      | 'preferredLocations'
      | 'subjects'
      | 'selectedDays'
      | 'weekdaySlots'
      | 'weekendSlots',
    id: string
  ) => {
    const already = tutorInquiryDraft[field].includes(id);
    if (field === 'selectedDays' && !already && tutorInquiryDraft.daysPerWeek > 0) {
      if (tutorInquiryDraft.selectedDays.length >= tutorInquiryDraft.daysPerWeek) {
        setTutorInquiryWarning(
          `Blocked: You selected ${tutorInquiryDraft.daysPerWeek} day(s) per week. Edit "Days per Week Available" first to pick more days.`
        );
        return;
      }
    }
    if (
      (field === 'weekdaySlots' || field === 'weekendSlots') &&
      !already &&
      tutorInquiryDraft.hoursPerDay !== 'any'
    ) {
      const cap = Number(tutorInquiryDraft.hoursPerDay);
      if (tutorInquiryDraft[field].length >= cap) {
        setTutorInquiryWarning(
          `Blocked: You selected ${cap} hour(s) per day. Change "Hours per Day Available" first to pick more slots.`
        );
        return;
      }
    }
    setTutorInquiryWarning(null);
    setTutorInquiryDraft((prev) => {
      const arr = prev[field];
      const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
      return { ...prev, [field]: next };
    });
  };

  const handleRunFinderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusBanner(null);
    setFinderWarning(null);
    setAppliedCriteria({ ...finderDraft });
  };

  const handleResetFinder = () => {
    setFinderDraft(DEFAULT_FINDER_CRITERIA);
    setAppliedCriteria(null);
    setFinderWarning(null);
    setStatusBanner(null);
  };

  const handleRunTutorInquirySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusBanner(null);
    setTutorInquiryWarning(null);
    setAppliedTutorInquiry({ ...tutorInquiryDraft });
  };

  const handleResetTutorInquiry = () => {
    setTutorInquiryDraft(DEFAULT_TUTOR_INQUIRY_CRITERIA);
    setAppliedTutorInquiry(null);
    setTutorInquiryWarning(null);
    setStatusBanner(null);
  };

  const handleConfirmFromFinder = async (ranked: RankedTutorMatch) => {
    const criteria = appliedCriteria || finderDraft;
    setConfirmingFinderTutorId(ranked.tutor.id);
    setError(null);
    setStatusBanner(null);
    try {
      await quickConfirmAdminMatch({
        tutorAppId: ranked.tutor.id,
        parentName: 'Phone Inquiry Parent (Owner Match)',
        location: criteria.location,
        mode: criteria.mode,
        sexPreference: criteria.sexPreference,
        feeBudget: criteria.feeBudget,
        kidsCount: criteria.kidsCount,
        gradeLevels: criteria.gradeLevels,
        subjects: criteria.subjects,
        selectedDays: criteria.selectedDays,
        hoursPerDay: criteria.hoursPerDay === 'any' ? '2' : criteria.hoursPerDay,
        weekdaySlots: criteria.weekdaySlots,
        weekendSlots: criteria.weekendSlots,
        compatibilityScore: ranked.score,
      });
      await loadOverview();
      setStatusBanner(
        `Match confirmed! ${ranked.tutor.profile.fullName} has been paired and moved to Confirmed Matches.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to confirm match');
    } finally {
      setConfirmingFinderTutorId(null);
    }
  };

  const handleConfirmParentFromTutorFinder = async (ranked: RankedParentMatch) => {
    const criteria = appliedTutorInquiry || tutorInquiryDraft;
    setConfirmingParentId(ranked.parent.id);
    setError(null);
    setStatusBanner(null);
    try {
      await quickConfirmAdminMatch({
        existingParentAppId: ranked.parent.id,
        tutorName: 'Phone Inquiry Tutor (Owner Match)',
        tutorEducation: criteria.educationLevel,
        tutorSex: criteria.sex,
        tutorExperience: criteria.priorExperience,
        preferredLocations: criteria.preferredLocations,
        mode: criteria.mode,
        feeBudget: criteria.expectedFeePerHour,
        subjects: criteria.subjects,
        selectedDays: criteria.selectedDays,
        hoursPerDay: criteria.hoursPerDay === 'any' ? '2' : criteria.hoursPerDay,
        weekdaySlots: criteria.weekdaySlots,
        weekendSlots: criteria.weekendSlots,
        compatibilityScore: ranked.score,
      });
      await loadOverview();
      setStatusBanner(
        `Match confirmed! Parent "${ranked.parent.parentProfile.fullName}" has been paired and moved to Confirmed Matches.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to confirm parent match');
    } finally {
      setConfirmingParentId(null);
    }
  };

  const handleUnlockOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    try {
      const res = await unlockOwnerWithPasscode(passcode);
      setUnlockedLocally(true);
      setPasscode('');
      onAuthenticatedAdmin?.(res);
    } catch (err) {
      setUnlockError(
        err instanceof Error ? err.message : 'Incorrect owner password. Please try again.'
      );
    } finally {
      setUnlocking(false);
    }
  };

  const handleUpdatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    if (newPw.trim().length < 6) {
      setPwMessage({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPw.trim() !== confirmPw.trim()) {
      setPwMessage({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    setSavingPw(true);
    try {
      await changeOwnerPasscode(currentPw, newPw);
      setPwMessage({
        type: 'ok',
        text: 'Owner password updated! Use your new password next time you open Owner Access.',
      });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update owner password.',
      });
    } finally {
      setSavingPw(false);
    }
  };

  const handleDownloadSingleHtml = async () => {
    setDownloadingSingle(true);
    setError(null);
    try {
      await downloadSingleHtml();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download single HTML');
    } finally {
      setDownloadingSingle(false);
    }
  };

  const handleTutorDecision = async (
    tutorId: string,
    status: TutorApplication['status']
  ) => {
    try {
      await updateTutorAdminStatus(tutorId, status);
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleManualPair = async (pId = selectedParentId, tId = selectedTutorId) => {
    if (!pId || !tId) return;
    try {
      await createAdminMatch(pId, tId);
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
    }
  };

  const handleUnmatch = async (matchId: string) => {
    try {
      await unmatchAdminMatch(matchId);
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to unmatch pair');
    }
  };

  const handleConfirmDeleteTutor = async (tutorId: string) => {
    setDeletingKey(`tutor_${tutorId}`);
    setError(null);
    try {
      await deleteAdminTutor(tutorId);
      setConfirmDeleteKey(null);
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete tutor');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleConfirmDeleteParent = async (parentId: string) => {
    setDeletingKey(`parent_${parentId}`);
    setError(null);
    try {
      await deleteAdminParent(parentId);
      setConfirmDeleteKey(null);
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete parent');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleSaveApplicantPasswordReset = async (userId: string) => {
    const trimmed = resetPwDraft.trim();
    if (trimmed.length < 6) {
      setError('Applicant replacement password must be at least 6 characters.');
      return;
    }
    setSavingUserReset(true);
    setError(null);
    try {
      await resetAdminUserPassword(userId, trimmed);
      setResettingUserId(null);
      setResetPwDraft('');
      setRevealedPwIds((prev) => new Set(prev).add(userId));
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reset applicant password');
    } finally {
      setSavingUserReset(false);
    }
  };

  const handleUploadCustomHero = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      try {
        localStorage.setItem('askuala_custom_hero', result);
        setHasCustomHero(true);
        setHeroNotice('Opening picture updated successfully.');
        onHeroUpdated?.();
      } catch {
        setError('Image is too large for browser storage. Please choose a smaller photo (< 2 MB).');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetHero = () => {
    try {
      localStorage.removeItem('askuala_custom_hero');
      setHasCustomHero(false);
      setHeroNotice('Restored default Ethiopian tutoring photograph.');
      onHeroUpdated?.();
    } catch {
      // ignore
    }
  };

  const handleDownloadBackup = () => {
    const payload = {
      platform: 'ኣስኳላ Tutors',
      exportedAt: new Date().toISOString(),
      tutors: submittedTutors,
      parents: submittedParents,
      matches,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `askuala-tutors-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const lookupLoc = (id: string) => ADDIS_LOCATIONS.find((l) => l.id === id)?.en || id;
  const lookupSubj = (id: string) => SUBJECTS.find((s) => s.id === id)?.en || id;
  const lookupGrade = (id: string) => KID_GRADE_LEVELS.find((g) => g.id === id)?.en || id;

  const filteredTutors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeTutors.filter((t) => {
      if (tutorFilter !== 'all' && t.status !== tutorFilter) return false;
      if (!q) return true;
      return (
        t.profile.fullName.toLowerCase().includes(q) ||
        t.profile.phone.toLowerCase().includes(q) ||
        t.profile.preferredLocations.some((l) => lookupLoc(l).toLowerCase().includes(q))
      );
    });
  }, [activeTutors, tutorFilter, searchQuery]);

  const filteredParents = useMemo(() => {
    const q = parentSearchQuery.trim().toLowerCase();
    return activeParents.filter((p) => {
      if (!q) return true;
      return (
        p.parentProfile.fullName.toLowerCase().includes(q) ||
        p.parentProfile.phone.toLowerCase().includes(q) ||
        lookupLoc(p.parentProfile.location).toLowerCase().includes(q)
      );
    });
  }, [activeParents, parentSearchQuery]);

  const renderApplicantPasswordBlock = (userId: string, userPassword?: string | null) => {
    const isRevealed = revealedPwIds.has(userId);
    const isResetting = resettingUserId === userId;
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-[#14532d] inline-flex items-center gap-1">
          <KeyRound className="w-3.5 h-3.5 text-[#15803d]" aria-hidden="true" />
          <span>Password:</span>
        </span>
        {userPassword ? (
          <>
            <code className="px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] font-mono text-[#0f172a] font-semibold">
              {isRevealed ? userPassword : '••••••••'}
            </code>
            <button
              type="button"
              onClick={() => toggleRevealPassword(userId)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#22c55e] bg-white text-[#14532d] font-bold hover:bg-[#f0fdf4] cursor-pointer"
            >
              {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{isRevealed ? 'Hide' : 'Show'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopyText(`pw_${userId}`, userPassword)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#bbf7d0] bg-[#f0fdf4] text-[#14532d] font-bold hover:bg-[#dcfce7] cursor-pointer"
            >
              {copiedKey === `pw_${userId}` ? (
                <>
                  <Check className="w-3 h-3 text-[#16a34a]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </>
        ) : (
          <span className="text-[#64748b] italic">Legacy account — click Reset to set password</span>
        )}

        {!isResetting ? (
          <button
            type="button"
            onClick={() => {
              setResettingUserId(userId);
              setResetPwDraft('');
            }}
            className="text-[#15803d] font-bold underline underline-offset-2 hover:text-[#14532d] cursor-pointer"
          >
            Reset Password
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 mt-1 w-full sm:w-auto">
            <input
              type="text"
              value={resetPwDraft}
              onChange={(e) => setResetPwDraft(e.target.value)}
              placeholder="New password (6+ chars)"
              className="min-h-[30px] px-2.5 py-1 rounded border border-[#14532d] bg-white text-xs text-[#0f172a]"
            />
            <button
              type="button"
              disabled={savingUserReset}
              onClick={() => handleSaveApplicantPasswordReset(userId)}
              className="px-2.5 py-1 rounded bg-[#14532d] text-white font-bold text-xs hover:bg-[#166534] cursor-pointer"
            >
              {savingUserReset ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setResettingUserId(null);
                setResetPwDraft('');
              }}
              className="px-2.5 py-1 rounded border border-[#cbd5e1] bg-white text-[#475569] font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 font-english">
      {!isAuthorized ? (
        <div className="min-h-[65vh] flex flex-col justify-center max-w-lg mx-auto py-4">
          <div className="white-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#dcfce7]">
              <button
                type="button"
                onClick={onBackHome}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-[#14532d] bg-[#f0fdf4] text-[#14532d] text-sm font-bold hover:bg-[#dcfce7] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Exit to Home</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#f0fdf4] border-2 border-[#22c55e] text-[#14532d] flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#14532d]">Owner Access</h1>
                <p className="text-sm text-[#475569]">
                  Enter your owner password to open the 6-section Coordinator Console.
                </p>
              </div>
            </div>

            {unlockError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border-2 border-red-300 text-red-900 text-sm font-bold"
              >
                {unlockError}
              </div>
            )}

            <form onSubmit={handleUnlockOwner} className="space-y-4">
              <div>
                <label
                  htmlFor="owner-passcode"
                  className="block text-sm font-bold text-[#14532d] mb-1.5"
                >
                  Owner Password
                </label>
                <div className="relative">
                  <input
                    id="owner-passcode"
                    type={showPasscode ? 'text' : 'password'}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter owner password"
                    required
                    autoFocus
                    className="w-full min-h-[44px] pl-3.5 pr-12 py-2.5 rounded-xl border-2 border-[#cbd5e1] bg-white text-[#0f172a] font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((p) => !p)}
                    aria-label={showPasscode ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#14532d] hover:bg-[#f0fdf4] cursor-pointer"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={unlocking}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
              >
                {unlocking ? 'Unlocking...' : 'Unlock Owner Console →'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#14532d] border-2 border-[#14532d] font-bold text-sm hover:bg-[#f0fdf4] shadow cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Exit to Home</span>
            </button>
          </div>

          {/* Header White Banner */}
          <div className="white-card p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#14532d]">
                Owner Coordinator Dashboard
              </h1>
              <p className="text-[#475569] mt-1">
                Submitted applications only (no drafts) &middot; Automatic Suggested Matches for
                website applicants + Two-Way Phone Inquiry Match Finder.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {!isStandaloneFileMode() && (
                <button
                  type="button"
                  onClick={handleDownloadSingleHtml}
                  disabled={downloadingSingle}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#15803d] text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-[#14532d] disabled:opacity-60 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>{downloadingSingle ? 'Building HTML...' : 'Download Single index.html'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="min-h-[42px] px-4 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold inline-flex items-center gap-2 hover:bg-[#f0fdf4] cursor-pointer"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>Download Data Backup (.json)</span>
              </button>
            </div>
          </div>

          {/* Summary Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Submitted Parents (Waiting)', value: activeParents.length },
              { label: 'Submitted Tutors (Active)', value: activeTutors.length },
              { label: 'Auto-Suggested Matches', value: suggestedMatches.length },
              { label: 'Confirmed Matches', value: confirmedMatches.length },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white text-[#0f172a] border-2 border-[#14532d] rounded-xl p-4 shadow"
              >
                <p className="text-xs font-bold text-[#15803d] uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-3xl font-bold text-[#14532d] mt-1 tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* 6-Section Navigation Tabs */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: 'parents' as const,
                  label: `1. Parents List (${activeParents.length})`,
                  icon: Users,
                },
                {
                  id: 'tutors' as const,
                  label: `2. Tutor List (${activeTutors.length})`,
                  icon: ShieldCheck,
                },
                {
                  id: 'suggested' as const,
                  label: `3. Suggested Matches (${suggestedMatches.length})`,
                  icon: Sparkles,
                },
                {
                  id: 'matches' as const,
                  label: `4. Confirmed Matches (${confirmedMatches.length})`,
                  icon: Handshake,
                },
                {
                  id: 'finder' as const,
                  label: '5. Find Perfect Tutor or Parent Search',
                  icon: PhoneCall,
                },
                {
                  id: 'settings' as const,
                  label: '6. Settings',
                  icon: Settings,
                },
              ]
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold cursor-pointer border-2 inline-flex items-center gap-2 transition-colors ${
                    tab === t.id
                      ? 'bg-[#14532d] text-white border-[#ffffff]'
                      : 'bg-white text-[#14532d] border-[#14532d] hover:bg-[#f0fdf4]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-white border-2 border-red-600 text-red-900 font-bold"
            >
              {error}
            </div>
          )}

          {statusBanner && (
            <div
              role="status"
              className="p-4 rounded-xl bg-[#dcfce7] border-2 border-[#14532d] text-[#14532d] font-bold flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#15803d] shrink-0" aria-hidden="true" />
                <span>{statusBanner}</span>
              </span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                aria-label="Dismiss notice"
                className="p-1 rounded hover:bg-white/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="white-card p-10 text-center text-[#14532d] font-bold">
              Loading coordinator records...
            </div>
          ) : (
            <div className="white-card p-6">
              {/* SECTION 1: PARENTS LIST (SUBMITTED ONLY, NO DRAFTS) */}
              {tab === 'parents' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-[#14532d]">
                        Submitted Parents List (Active Unmatched)
                      </h2>
                      <p className="text-xs text-[#475569]">
                        Shows only fully submitted parent applications (drafts are hidden). Confirmed
                        families move to Confirmed Matches.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <Search
                        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#15803d]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={parentSearchQuery}
                        onChange={(e) => setParentSearchQuery(e.target.value)}
                        placeholder="Search parent name, phone, or area..."
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-lg border border-[#22c55e] bg-white text-sm"
                      />
                    </div>
                  </div>

                  {filteredParents.length === 0 ? (
                    <p className="text-sm text-[#475569]">
                      No submitted unmatched parents right now.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#dcfce7]">
                      {filteredParents.map((p) => {
                        const delKey = `parent_${p.id}`;
                        const confirmingDelete = confirmDeleteKey === delKey;
                        return (
                          <div
                            key={p.id}
                            className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-lg text-[#14532d] font-amharic">
                                  {p.parentProfile.fullName}
                                </span>
                                <span aria-hidden="true">&middot;</span>
                                <span className="text-sm tabular-nums text-[#475569]">
                                  {p.parentProfile.phone}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyText(`parent_${p.id}`, p.parentProfile.phone)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] text-[11px] font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                                  title="Copy parent phone number"
                                >
                                  {copiedKey === `parent_${p.id}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-[#16a34a]" aria-hidden="true" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" aria-hidden="true" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                                <span aria-hidden="true">&middot;</span>
                                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#22c55e] text-[#14532d]">
                                  {p.status}
                                </span>
                              </div>
                              <p className="text-sm text-[#0f172a]">
                                Location: {lookupLoc(p.parentProfile.location)} &middot; Kids:{' '}
                                {p.kids.length} (
                                {p.kids.map((k) => lookupGrade(k.gradeLevel)).join(', ')}) &middot;
                                Mode: {p.tutorPreference.mode}
                              </p>
                              <p className="text-xs text-[#475569]">
                                Subjects:{' '}
                                {Array.from(new Set(p.kids.flatMap((k) => k.preferredSubjects)))
                                  .map(lookupSubj)
                                  .join(', ')}{' '}
                                &middot; Days:{' '}
                                {Array.from(new Set(p.kids.flatMap((k) => k.selectedDays))).join(', ')}
                              </p>
                              {renderApplicantPasswordBlock(p.userId, p.userPassword)}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {p.summaryPdfFileId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openPdfInspector(
                                      p.summaryPdfFileId!,
                                      `${p.parentProfile.fullName} — Amharic Parent PDF`
                                    )
                                  }
                                  className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                                >
                                  <FileText className="w-4 h-4" aria-hidden="true" />
                                  <span>View Parent PDF</span>
                                </button>
                              )}

                              {!confirmingDelete ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(delKey)}
                                  className="min-h-[40px] px-3 py-2 rounded-xl border-2 border-red-300 bg-white text-red-700 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                                  <span>Delete</span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={deletingKey === delKey}
                                    onClick={() => handleConfirmDeleteParent(p.id)}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#dc2626] text-white text-xs font-bold hover:bg-red-700 cursor-pointer"
                                  >
                                    {deletingKey === delKey
                                      ? 'Deleting...'
                                      : 'Confirm Permanent Delete'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(null)}
                                    className="min-h-[40px] px-2.5 py-2 rounded-xl border border-[#cbd5e1] bg-white text-xs font-bold text-[#475569] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 2: TUTOR LIST (SUBMITTED ONLY, NO DRAFTS) */}
              {tab === 'tutors' && (
                <div className="space-y-4">
                  <div className="instruction-box">
                    <FileText className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Showing only <strong>submitted active unmatched</strong> tutors (drafts are
                      hidden). Confirmed matched tutors appear under <strong>Confirmed Matches</strong>.
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(['all', 'submitted', 'verified', 'rejected'] as const).map((statusKey) => (
                        <button
                          key={statusKey}
                          type="button"
                          onClick={() => setTutorFilter(statusKey)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border cursor-pointer ${
                            tutorFilter === statusKey
                              ? 'bg-[#14532d] text-white border-[#14532d]'
                              : 'bg-[#f0fdf4] text-[#14532d] border-[#22c55e]'
                          }`}
                        >
                          {statusKey}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search
                        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#15803d]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tutor name, phone, or area..."
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-lg border border-[#22c55e] bg-white text-sm"
                      />
                    </div>
                  </div>

                  {filteredTutors.length === 0 ? (
                    <p className="text-sm text-[#475569]">
                      No submitted unmatched tutor applications match your filter.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#dcfce7]">
                      {filteredTutors.map((t) => {
                        const pdfId = t.mergedPdfFileId || t.uploadedDocuments[0]?.fileId;
                        const esslceTxt = formatEsslceLabel(t.academicRecords);
                        const delKey = `tutor_${t.id}`;
                        const confirmingDelete = confirmDeleteKey === delKey;
                        return (
                          <div
                            key={t.id}
                            className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-bold text-lg text-[#14532d]">
                                  {t.profile.fullName}
                                </span>
                                <span aria-hidden="true">&middot;</span>
                                <span className="tabular-nums text-[#475569]">
                                  {t.profile.phone}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(`tutor_${t.id}`, t.profile.phone)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] text-[11px] font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                                  title="Copy tutor phone number"
                                >
                                  {copiedKey === `tutor_${t.id}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-[#16a34a]" aria-hidden="true" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" aria-hidden="true" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                                <span aria-hidden="true">&middot;</span>
                                <span className="font-bold uppercase text-xs px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#22c55e] text-[#14532d]">
                                  {t.status}
                                </span>
                                {t.nationalIdFront && t.nationalIdBack ? (
                                  <span className="font-bold text-xs px-2 py-0.5 rounded bg-[#dcfce7] border border-[#16a34a] text-[#14532d]">
                                    ID Front &amp; Back ✓
                                  </span>
                                ) : (
                                  <span className="font-bold text-xs px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800">
                                    No ID Photos
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-[#0f172a]">
                                {EDUCATION_LEVEL_LABELS[t.profile.educationLevel]} &middot;{' '}
                                {t.profile.preferredLocations.map(lookupLoc).join(', ')}
                              </p>
                              <p className="text-xs text-[#475569]">
                                Subjects: {t.profile.preferredSubjects.map(lookupSubj).join(', ')}{' '}
                                &middot; Fee: {formatFeeTierLabel(t.profile.expectedFeePerHour)}
                                {t.profile.daysPerWeek
                                  ? ` · ${t.profile.daysPerWeek} days/wk`
                                  : ''}
                                {t.profile.hoursPerDay
                                  ? ` · ${t.profile.hoursPerDay} hr/day`
                                  : ''}
                                {esslceTxt ? ` · ESSLCE: ${esslceTxt}` : ''}
                                {t.agreedToTerms ? ' · Agreed Terms ✓' : ''}
                              </p>
                              {renderApplicantPasswordBlock(t.userId, t.userPassword)}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {pdfId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openPdfInspector(
                                      pdfId,
                                      `${t.profile.fullName} — Application Dossier PDF`
                                    )
                                  }
                                  className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                                >
                                  <FileText className="w-4 h-4" aria-hidden="true" />
                                  <span>Review PDF</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleTutorDecision(t.id, 'verified')}
                                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#15803d] text-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#14532d] cursor-pointer"
                              >
                                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                                <span>Verify</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleTutorDecision(t.id, 'rejected')}
                                className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-amber-300 bg-white text-amber-800 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-amber-50 cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" aria-hidden="true" />
                                <span>Reject</span>
                              </button>

                              {!confirmingDelete ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(delKey)}
                                  className="min-h-[40px] px-3 py-2 rounded-xl border-2 border-red-300 bg-white text-red-700 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                                  <span>Delete</span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={deletingKey === delKey}
                                    onClick={() => handleConfirmDeleteTutor(t.id)}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#dc2626] text-white text-xs font-bold hover:bg-red-700 cursor-pointer"
                                  >
                                    {deletingKey === delKey
                                      ? 'Deleting...'
                                      : 'Confirm Permanent Delete'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(null)}
                                    className="min-h-[40px] px-2.5 py-2 rounded-xl border border-[#cbd5e1] bg-white text-xs font-bold text-[#475569] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 3: SUGGESTED MATCHES (AUTO-COMPUTED FOR WEBSITE APPLICANTS + MANUAL PAIR) */}
              {tab === 'suggested' && (
                <div className="space-y-6">
                  <div className="instruction-box">
                    <Sparkles className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Parents and tutors who submitted applications on this website are{' '}
                      <strong>automatically matched</strong> here by location, subjects, schedule,
                      and hourly budget. Click <strong>Confirm Match</strong> to register any pair.
                    </span>
                  </div>

                  {/* Auto-Suggested Compatibility Pairs */}
                  <div className="space-y-3">
                    <h2 className="text-lg font-bold text-[#14532d]">
                      Automatic Website Compatibility Suggestions ({suggestedMatches.length})
                    </h2>
                    {suggestedMatches.length === 0 ? (
                      <div className="p-6 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-sm text-[#475569]">
                        No pending automatic suggestions right now (all compatible submitted pairs
                        have either been confirmed or are waiting for more applicants).
                      </div>
                    ) : (
                      <div className="divide-y divide-[#dcfce7] border border-[#bbf7d0] rounded-xl px-4 bg-[#f0fdf4]/50">
                        {suggestedMatches.map((m) => (
                          <div
                            key={m.id}
                            className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div>
                              <p className="font-bold text-[#14532d]">
                                <span className="font-amharic">{m.parentName}</span> ({m.parentPhone}
                                ) &harr; {m.tutorName} ({m.tutorPhone})
                              </p>
                              <p className="text-xs text-[#475569] tabular-nums">
                                <strong>{m.compatibilityScore}% match</strong> &middot;{' '}
                                {lookupLoc(m.parentLocation)} &middot;{' '}
                                {m.matchedSubjects.map(lookupSubj).join(', ')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleManualPair(m.parentAppId, m.tutorAppId)}
                              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#14532d] text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#166534] cursor-pointer"
                            >
                              <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Confirm Match</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Manual Pairing of Submitted Unmatched Applicants */}
                  <div className="p-4 rounded-xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-3">
                    <h2 className="text-lg font-bold text-[#14532d]">
                      Manually Pair Submitted Parent &amp; Tutor
                    </h2>
                    {activeParents.length === 0 || activeTutors.length === 0 ? (
                      <p className="text-sm text-[#475569]">
                        Need at least one submitted unmatched parent and one submitted unmatched
                        tutor to pair manually.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <select
                          value={selectedParentId}
                          onChange={(e) => setSelectedParentId(e.target.value)}
                          aria-label="Select Unmatched Parent"
                          className="min-h-[42px] px-3 py-2 rounded-xl border-2 border-[#cbd5e1] bg-white font-amharic text-[#0f172a]"
                        >
                          {activeParents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.parentProfile.fullName} ({lookupLoc(p.parentProfile.location)})
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedTutorId}
                          onChange={(e) => setSelectedTutorId(e.target.value)}
                          aria-label="Select Unmatched Tutor"
                          className="min-h-[42px] px-3 py-2 rounded-xl border-2 border-[#cbd5e1] bg-white text-[#0f172a]"
                        >
                          {activeTutors.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.profile.fullName} ({t.status})
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleManualPair()}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Handshake className="w-4 h-4" aria-hidden="true" />
                          <span>Confirm Pairing</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 4: CONFIRMED (REGISTERED) MATCHES */}
              {tab === 'matches' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-xl bg-[#dcfce7] border-2 border-[#14532d] space-y-3">
                    <h2 className="text-lg font-bold text-[#14532d] flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                      <span>Confirmed (Registered) Matches ({confirmedMatches.length})</span>
                    </h2>
                    {confirmedMatches.length === 0 ? (
                      <p className="text-sm text-[#14532d]">
                        No confirmed matches yet. Confirm a pair from <strong>Suggested Matches</strong>{' '}
                        or <strong>Find Perfect Tutor or Parent Search</strong>.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {confirmedMatches.map((m) => (
                          <div
                            key={m.id}
                            className="p-4 rounded-xl bg-white border border-[#22c55e] flex flex-wrap items-center justify-between gap-3"
                          >
                            <div>
                              <p className="font-bold text-[#14532d]">
                                <span className="font-amharic">{m.parentName}</span> ({m.parentPhone}
                                ) &harr; {m.tutorName} ({m.tutorPhone})
                              </p>
                              <p className="text-xs text-[#475569] tabular-nums mt-0.5">
                                {m.compatibilityScore}% compatibility &middot;{' '}
                                {lookupLoc(m.parentLocation)} &middot;{' '}
                                {m.matchedSubjects.map(lookupSubj).join(', ')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUnmatch(m.id)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border-2 border-amber-400 bg-white text-amber-900 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-amber-50 cursor-pointer"
                            >
                              <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Unmatch</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 5: FIND PERFECT TUTOR OR PARENT SEARCH (WALK-IN / PHONE CALLERS) */}
              {tab === 'finder' && (
                <div className="space-y-6">
                  <div className="instruction-box">
                    <SlidersHorizontal className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      For people who <strong>called by phone</strong> and did NOT register on the
                      website: choose one of the two options below to open the matching form
                      automatically. Website applicants remain automatically matched in{' '}
                      <strong>Suggested Matches</strong>.
                    </span>
                  </div>

                  {/* First 2 Choices */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFinderMode('for_parent')}
                      className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                        finderMode === 'for_parent'
                          ? 'bg-[#14532d] text-white border-[#14532d] shadow-md'
                          : 'bg-[#f0fdf4] text-[#14532d] border-[#22c55e] hover:bg-[#dcfce7]'
                      }`}
                    >
                      <p className="text-lg font-extrabold">1. Looking for Perfect Tutor</p>
                      <p
                        className={`text-xs mt-1 ${
                          finderMode === 'for_parent' ? 'text-[#dcfce7]' : 'text-[#475569]'
                        }`}
                      >
                        A parent called looking for a tutor — enter tutor requirements, subjects,
                        kids&apos; grade(s), fee, days/week &amp; schedule (no parent name/phone
                        needed).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFinderMode('for_tutor')}
                      className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                        finderMode === 'for_tutor'
                          ? 'bg-[#14532d] text-white border-[#14532d] shadow-md'
                          : 'bg-[#f0fdf4] text-[#14532d] border-[#22c55e] hover:bg-[#dcfce7]'
                      }`}
                    >
                      <p className="text-lg font-extrabold">2. Looking for Perfect Parent</p>
                      <p
                        className={`text-xs mt-1 ${
                          finderMode === 'for_tutor' ? 'text-[#dcfce7]' : 'text-[#475569]'
                        }`}
                      >
                        A tutor called looking for a family — enter tutor education, sex, fee,
                        locations, subjects &amp; schedule to find ranked website parents.
                      </p>
                    </button>
                  </div>

                  {/* OPTION 1: LOOKING FOR PERFECT TUTOR */}
                  {finderMode === 'for_parent' && (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleRunFinderSearch}
                        className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div>
                            <label
                              htmlFor="finder-req-edu"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Tutor Education Level Needed
                            </label>
                            <select
                              id="finder-req-edu"
                              value={finderDraft.requiredEducationLevel}
                              onChange={(e) =>
                                setFinderDraft({
                                  ...finderDraft,
                                  requiredEducationLevel: e.target.value as RequiredTutorEducation,
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="any">Any Qualified Tutor</option>
                              <option value="grade_11_plus">Grade 11+</option>
                              <option value="grade_12_plus">Grade 12+</option>
                              <option value="college_plus">College Student or Higher</option>
                              <option value="bachelors_plus">Bachelor&apos;s Graduate or Higher</option>
                              <option value="certified_teacher">Certified Teacher Only</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-location"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Location (Addis Ababa)
                            </label>
                            <select
                              id="finder-location"
                              value={finderDraft.location}
                              onChange={(e) =>
                                setFinderDraft({ ...finderDraft, location: e.target.value })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="any">Any Addis Ababa Area</option>
                              {ADDIS_LOCATIONS.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.en}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-mode"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Tutoring Mode
                            </label>
                            <select
                              id="finder-mode"
                              value={finderDraft.mode}
                              onChange={(e) =>
                                setFinderDraft({
                                  ...finderDraft,
                                  mode: e.target.value as OwnerParentSearchCriteria['mode'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="in_person">In-Person (Home Visit)</option>
                              <option value="online">Online</option>
                              <option value="any">Any Mode</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-fee"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Hourly Fee Budget
                            </label>
                            <select
                              id="finder-fee"
                              value={finderDraft.feeBudget}
                              onChange={(e) =>
                                setFinderDraft({
                                  ...finderDraft,
                                  feeBudget: e.target.value as OwnerParentSearchCriteria['feeBudget'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="any">Any Hourly Fee</option>
                              <option value="400_600">400 – 600 ETB / hr</option>
                              <option value="600_plus">600+ ETB / hr</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                          <div>
                            <label
                              htmlFor="finder-kids-count"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Number of Students
                            </label>
                            <select
                              id="finder-kids-count"
                              value={finderDraft.kidsCount}
                              onChange={(e) =>
                                setFinderDraft({
                                  ...finderDraft,
                                  kidsCount: Number(e.target.value),
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                            >
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n}>
                                  {n} {n === 1 ? 'Student' : 'Students'}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-sex"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Tutor Sex Preference
                            </label>
                            <select
                              id="finder-sex"
                              value={finderDraft.sexPreference}
                              onChange={(e) =>
                                setFinderDraft({
                                  ...finderDraft,
                                  sexPreference: e.target
                                    .value as OwnerParentSearchCriteria['sexPreference'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="any">Any (Male or Female)</option>
                              <option value="female">Female Tutor</option>
                              <option value="male">Male Tutor</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-exp"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Prior Experience
                            </label>
                            <select
                              id="finder-exp"
                              value={finderDraft.minExperience}
                              onChange={(e) =>
                                setFinderDraft({
                                  ...finderDraft,
                                  minExperience: e.target
                                    .value as OwnerParentSearchCriteria['minExperience'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="any">Any Experience</option>
                              <option value="1_year_plus">1 Year+</option>
                              <option value="2_plus_years">2 Years+</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-min-days"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              No. of Days per Week Needed
                            </label>
                            <select
                              id="finder-min-days"
                              value={finderDraft.minDaysPerWeek}
                              onChange={(e) => {
                                setFinderWarning(null);
                                setFinderDraft({
                                  ...finderDraft,
                                  minDaysPerWeek: Number(e.target.value),
                                });
                              }}
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                            >
                              <option value={0}>Select days/week...</option>
                              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                <option key={d} value={d}>
                                  {d} day{d > 1 ? 's' : ''}/week
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="finder-hours"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              No. of Hours per Day
                            </label>
                            <select
                              id="finder-hours"
                              value={finderDraft.hoursPerDay}
                              onChange={(e) => {
                                setFinderWarning(null);
                                setFinderDraft({
                                  ...finderDraft,
                                  hoursPerDay: e.target
                                    .value as OwnerParentSearchCriteria['hoursPerDay'],
                                });
                              }}
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                            >
                              <option value="any">Select hours/day...</option>
                              <option value="1">1 hour / day</option>
                              <option value="2">2 hours / day</option>
                              <option value="3">3 hours / day</option>
                            </select>
                          </div>
                        </div>

                        {/* Student Grade Levels */}
                        <fieldset>
                          <legend className="text-xs font-bold text-[#14532d] mb-2">
                            Education / Grade Level(s) of Kid(s) ({finderDraft.gradeLevels.length}{' '}
                            selected)
                          </legend>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                            {KID_GRADE_LEVELS.map((g) => {
                              const checked = finderDraft.gradeLevels.includes(g.id);
                              return (
                                <label
                                  key={g.id}
                                  className={`px-3 py-2 rounded-lg border text-xs text-center font-bold cursor-pointer ${
                                    checked
                                      ? 'bg-[#14532d] text-white border-[#14532d]'
                                      : 'bg-white text-[#14532d] border-[#cbd5e1] hover:border-[#22c55e]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFinderArray('gradeLevels', g.id)}
                                    className="sr-only"
                                  />
                                  <span>{g.en}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>

                        {/* Subjects Needed */}
                        <fieldset>
                          <legend className="text-xs font-bold text-[#14532d] mb-2">
                            Subjects the Kids Need ({finderDraft.subjects.length} selected)
                          </legend>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                            {SUBJECTS.map((subj) => {
                              const checked = finderDraft.subjects.includes(subj.id);
                              return (
                                <label
                                  key={subj.id}
                                  className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                                    checked
                                      ? 'bg-[#14532d] text-white border-[#14532d]'
                                      : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFinderArray('subjects', subj.id)}
                                    className="sr-only"
                                  />
                                  <span>{subj.en}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>

                        {finderWarning && (
                          <div
                            role="alert"
                            className="p-3 rounded-xl bg-[#fef2f2] border border-[#dc2626] text-xs font-bold text-[#991b1b] flex items-center gap-2"
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{finderWarning}</span>
                          </div>
                        )}

                        {/* Days Needed (appears automatically once days/week chosen) */}
                        {finderDraft.minDaysPerWeek > 0 && (
                          <fieldset className="p-3.5 rounded-xl bg-white border border-[#bbf7d0]">
                            <legend className="text-xs font-bold text-[#14532d] mb-2">
                              Specific Days the Kids Need ({finderDraft.selectedDays.length}/
                              {finderDraft.minDaysPerWeek} max)
                            </legend>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                              {DAYS_OF_WEEK.map((day) => {
                                const checked = finderDraft.selectedDays.includes(day.id);
                                return (
                                  <label
                                    key={day.id}
                                    className={`px-3 py-2 rounded-lg border text-xs text-center font-bold cursor-pointer ${
                                      checked
                                        ? 'bg-[#14532d] text-white border-[#14532d]'
                                        : 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleFinderArray('selectedDays', day.id)}
                                      className="sr-only"
                                    />
                                    <span>{day.en}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        )}

                        {/* Ethiopian Time Schedule (appears automatically once hours/day chosen) */}
                        {finderDraft.hoursPerDay !== 'any' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-white border border-[#bbf7d0]">
                              <p className="text-xs font-bold text-[#14532d] mb-2">
                                Weekday Schedule (Ethiopian Time &mdash; max{' '}
                                {finderDraft.hoursPerDay} slot
                                {finderDraft.hoursPerDay === '1' ? '' : 's'})
                              </p>
                              <div className="space-y-1.5">
                                {WEEKDAY_SLOTS.map((slot) => {
                                  const checked = finderDraft.weekdaySlots.includes(slot.id);
                                  return (
                                    <label
                                      key={slot.id}
                                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer tabular-nums ${
                                        checked
                                          ? 'bg-[#14532d] text-white border-[#14532d]'
                                          : 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleFinderArray('weekdaySlots', slot.id)}
                                        className="sr-only"
                                      />
                                      <span>{slot.en}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-white border border-[#bbf7d0]">
                              <p className="text-xs font-bold text-[#14532d] mb-2">
                                Weekend Schedule (Ethiopian Time &mdash; max{' '}
                                {finderDraft.hoursPerDay} slot
                                {finderDraft.hoursPerDay === '1' ? '' : 's'})
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {WEEKEND_SLOTS.map((slot) => {
                                  const checked = finderDraft.weekendSlots.includes(slot.id);
                                  return (
                                    <label
                                      key={slot.id}
                                      className={`flex items-center justify-center px-2 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer tabular-nums ${
                                        checked
                                          ? 'bg-[#14532d] text-white border-[#14532d]'
                                          : 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleFinderArray('weekendSlots', slot.id)}
                                        className="sr-only"
                                      />
                                      <span>{slot.en.replace(' (Ethiopian Time)', '')}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-3 border-t border-[#bbf7d0] flex flex-wrap items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#14532d]">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={finderDraft.verifiedOnly}
                                onChange={(e) =>
                                  setFinderDraft({
                                    ...finderDraft,
                                    verifiedOnly: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 accent-[#14532d]"
                              />
                              <span>Verified Tutors Only</span>
                            </label>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={finderDraft.excludeMatched}
                                onChange={(e) =>
                                  setFinderDraft({
                                    ...finderDraft,
                                    excludeMatched: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 accent-[#14532d]"
                              />
                              <span>Exclude Confirmed Matched Tutors</span>
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              onClick={handleResetFinder}
                              className="min-h-[42px] px-4 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold hover:bg-[#f0fdf4] cursor-pointer"
                            >
                              Reset
                            </button>
                            <button
                              type="submit"
                              className="min-h-[42px] px-6 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold hover:bg-[#166534] inline-flex items-center gap-2 shadow cursor-pointer"
                            >
                              <Search className="w-4 h-4" aria-hidden="true" />
                              <span>Find Perfect Tutor Matches</span>
                            </button>
                          </div>
                        </div>
                      </form>

                      {appliedCriteria && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#dcfce7]">
                            <h3 className="text-xl font-bold text-[#14532d] flex items-center gap-2">
                              <Award className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                              <span>
                                Ranked Perfect Tutors ({finderResults.length} evaluated)
                              </span>
                            </h3>
                            <span className="text-xs font-bold text-[#15803d]">
                              Sorted from 100% Perfect Match downwards
                            </span>
                          </div>

                          {finderResults.length === 0 ? (
                            <div className="p-8 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-center text-sm text-[#475569]">
                              No active submitted tutors match these pool filters right now.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {finderResults.map((item, idx) => {
                                const t = item.tutor;
                                const pdfId = t.mergedPdfFileId || t.uploadedDocuments[0]?.fileId;
                                const esslceTxt = formatEsslceLabel(t.academicRecords);
                                const tierBadge =
                                  item.tier === 'perfect'
                                    ? {
                                        text: 'PERFECT MATCH',
                                        cls: 'bg-[#14532d] text-white border-[#14532d]',
                                      }
                                    : item.tier === 'strong'
                                    ? {
                                        text: 'STRONG MATCH',
                                        cls: 'bg-[#dcfce7] text-[#14532d] border-[#16a34a]',
                                      }
                                    : {
                                        text: 'PARTIAL MATCH',
                                        cls: 'bg-amber-50 text-amber-900 border-amber-300',
                                      };

                                return (
                                  <div
                                    key={t.id}
                                    className={`p-5 rounded-2xl border-2 space-y-3 ${
                                      item.tier === 'perfect'
                                        ? 'bg-[#f0fdf4] border-[#14532d] shadow-sm'
                                        : 'bg-white border-[#bbf7d0]'
                                    }`}
                                  >
                                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                      <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="px-2.5 py-1 rounded-lg bg-[#14532d] text-white text-xs font-extrabold tabular-nums">
                                            #{idx + 1} &middot; {item.score}%
                                          </span>
                                          <span
                                            className={`px-2.5 py-0.5 rounded-lg border text-xs font-extrabold ${tierBadge.cls}`}
                                          >
                                            {tierBadge.text}
                                          </span>
                                          <span className="text-lg font-bold text-[#14532d]">
                                            {t.profile.fullName}
                                          </span>
                                          <span className="text-sm tabular-nums text-[#475569]">
                                            {t.profile.phone}
                                          </span>
                                          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-white border border-[#22c55e] text-[#14532d]">
                                            {t.status}
                                          </span>
                                        </div>

                                        <p className="text-xs sm:text-sm text-[#0f172a]">
                                          <strong>
                                            {EDUCATION_LEVEL_LABELS[t.profile.educationLevel]}
                                          </strong>{' '}
                                          &middot; Sex: {t.profile.sex} &middot; Fee:{' '}
                                          {formatFeeTierLabel(t.profile.expectedFeePerHour)}
                                          {esslceTxt ? ` · ESSLCE: ${esslceTxt}` : ''}
                                          {t.academicRecords.graduationCgpa
                                            ? ` · CGPA: ${t.academicRecords.graduationCgpa}`
                                            : ''}
                                        </p>

                                        <div className="flex flex-wrap gap-2 pt-1">
                                          {item.checks.map((chk) => (
                                            <span
                                              key={chk.label}
                                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                                                chk.ok
                                                  ? 'bg-white border-[#22c55e] text-[#14532d]'
                                                  : 'bg-amber-50 border-amber-300 text-amber-900'
                                              }`}
                                            >
                                              <span>{chk.ok ? '✓' : '⚠'}</span>
                                              <span>
                                                <strong>{chk.label}:</strong> {chk.detail}
                                              </span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        {pdfId && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openPdfInspector(
                                                pdfId,
                                                `${t.profile.fullName} — Application Dossier PDF`
                                              )
                                            }
                                            className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                                          >
                                            <FileText className="w-4 h-4" aria-hidden="true" />
                                            <span>Review PDF</span>
                                          </button>
                                        )}

                                        {t.status !== 'verified' && (
                                          <button
                                            type="button"
                                            onClick={() => handleTutorDecision(t.id, 'verified')}
                                            className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-[#15803d] bg-white text-[#15803d] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                                          >
                                            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                                            <span>Verify</span>
                                          </button>
                                        )}

                                        {!confirmedTutorIds.has(t.id) && (
                                          <button
                                            type="button"
                                            disabled={confirmingFinderTutorId === t.id}
                                            onClick={() => handleConfirmFromFinder(item)}
                                            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#14532d] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                                          >
                                            <Handshake className="w-4 h-4" aria-hidden="true" />
                                            <span>
                                              {confirmingFinderTutorId === t.id
                                                ? 'Confirming...'
                                                : 'Confirm Match & Save'}
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* OPTION 2: LOOKING FOR PERFECT PARENT */}
                  {finderMode === 'for_tutor' && (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleRunTutorInquirySearch}
                        className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                          <div>
                            <label
                              htmlFor="ti-edu"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Tutor Education Level
                            </label>
                            <select
                              id="ti-edu"
                              value={tutorInquiryDraft.educationLevel}
                              onChange={(e) =>
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  educationLevel: e.target
                                    .value as OwnerTutorInquiryCriteria['educationLevel'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="grade_11">Grade 11 Student</option>
                              <option value="grade_12">Grade 12 Student</option>
                              <option value="college">College Student</option>
                              <option value="bachelors">Bachelor&apos;s Graduate</option>
                              <option value="certified_teacher">Certified Teacher</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="ti-sex"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Tutor Sex
                            </label>
                            <select
                              id="ti-sex"
                              value={tutorInquiryDraft.sex}
                              onChange={(e) =>
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  sex: e.target.value as 'female' | 'male',
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="female">Female</option>
                              <option value="male">Male</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="ti-mode"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Tutoring Mode Available
                            </label>
                            <select
                              id="ti-mode"
                              value={tutorInquiryDraft.mode}
                              onChange={(e) =>
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  mode: e.target.value as OwnerTutorInquiryCriteria['mode'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="both">Both (In-Person &amp; Online)</option>
                              <option value="in_person">In-Person Only</option>
                              <option value="online">Online Only</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="ti-fee"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Expected Hourly Fee
                            </label>
                            <select
                              id="ti-fee"
                              value={tutorInquiryDraft.expectedFeePerHour}
                              onChange={(e) =>
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  expectedFeePerHour: e.target.value as '400_600' | '600_plus',
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="400_600">400 – 600 ETB / hr</option>
                              <option value="600_plus">600+ ETB / hr</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="ti-exp"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              Prior Experience
                            </label>
                            <select
                              id="ti-exp"
                              value={tutorInquiryDraft.priorExperience}
                              onChange={(e) =>
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  priorExperience: e.target
                                    .value as OwnerTutorInquiryCriteria['priorExperience'],
                                })
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold"
                            >
                              <option value="first_time">First Time</option>
                              <option value="1_year">1 Year</option>
                              <option value="2_plus_years">2 Years+</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label
                              htmlFor="ti-days-wk"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              No. of Days per Week Available
                            </label>
                            <select
                              id="ti-days-wk"
                              value={tutorInquiryDraft.daysPerWeek}
                              onChange={(e) => {
                                setTutorInquiryWarning(null);
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  daysPerWeek: Number(e.target.value),
                                });
                              }}
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                            >
                              <option value={0}>Select days/week...</option>
                              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                <option key={d} value={d}>
                                  {d} day{d > 1 ? 's' : ''}/week
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="ti-hours"
                              className="block text-xs font-bold text-[#14532d] mb-1"
                            >
                              No. of Hours per Day Available
                            </label>
                            <select
                              id="ti-hours"
                              value={tutorInquiryDraft.hoursPerDay}
                              onChange={(e) => {
                                setTutorInquiryWarning(null);
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  hoursPerDay: e.target
                                    .value as OwnerTutorInquiryCriteria['hoursPerDay'],
                                });
                              }}
                              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                            >
                              <option value="any">Select hours/day...</option>
                              <option value="1">1 hour / day</option>
                              <option value="2">2 hours / day</option>
                              <option value="3">3 hours / day</option>
                            </select>
                          </div>
                        </div>

                        {/* Locations Covered */}
                        <fieldset>
                          <legend className="text-xs font-bold text-[#14532d] mb-2">
                            Addis Ababa Areas Tutor Can Teach In (
                            {tutorInquiryDraft.preferredLocations.length} selected)
                          </legend>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {ADDIS_LOCATIONS.map((loc) => {
                              const checked = tutorInquiryDraft.preferredLocations.includes(loc.id);
                              return (
                                <label
                                  key={loc.id}
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer truncate ${
                                    checked
                                      ? 'bg-[#14532d] text-white border-[#14532d]'
                                      : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleTutorInquiryArray('preferredLocations', loc.id)
                                    }
                                    className="sr-only"
                                  />
                                  <span>{loc.en}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>

                        {/* Subjects Taught */}
                        <fieldset>
                          <legend className="text-xs font-bold text-[#14532d] mb-2">
                            Subjects Tutor Can Teach ({tutorInquiryDraft.subjects.length} selected)
                          </legend>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                            {SUBJECTS.map((subj) => {
                              const checked = tutorInquiryDraft.subjects.includes(subj.id);
                              return (
                                <label
                                  key={subj.id}
                                  className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                                    checked
                                      ? 'bg-[#14532d] text-white border-[#14532d]'
                                      : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTutorInquiryArray('subjects', subj.id)}
                                    className="sr-only"
                                  />
                                  <span>{subj.en}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>

                        {tutorInquiryWarning && (
                          <div
                            role="alert"
                            className="p-3 rounded-xl bg-[#fef2f2] border border-[#dc2626] text-xs font-bold text-[#991b1b] flex items-center gap-2"
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{tutorInquiryWarning}</span>
                          </div>
                        )}

                        {tutorInquiryDraft.daysPerWeek > 0 && (
                          <fieldset className="p-3.5 rounded-xl bg-white border border-[#bbf7d0]">
                            <legend className="text-xs font-bold text-[#14532d] mb-2">
                              Specific Days Tutor Is Available ({tutorInquiryDraft.selectedDays.length}
                              /{tutorInquiryDraft.daysPerWeek} max)
                            </legend>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                              {DAYS_OF_WEEK.map((day) => {
                                const checked = tutorInquiryDraft.selectedDays.includes(day.id);
                                return (
                                  <label
                                    key={day.id}
                                    className={`px-3 py-2 rounded-lg border text-xs text-center font-bold cursor-pointer ${
                                      checked
                                        ? 'bg-[#14532d] text-white border-[#14532d]'
                                        : 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleTutorInquiryArray('selectedDays', day.id)
                                      }
                                      className="sr-only"
                                    />
                                    <span>{day.en}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        )}

                        {tutorInquiryDraft.hoursPerDay !== 'any' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-white border border-[#bbf7d0]">
                              <p className="text-xs font-bold text-[#14532d] mb-2">
                                Weekday Slots (max {tutorInquiryDraft.hoursPerDay})
                              </p>
                              <div className="space-y-1.5">
                                {WEEKDAY_SLOTS.map((slot) => {
                                  const checked = tutorInquiryDraft.weekdaySlots.includes(slot.id);
                                  return (
                                    <label
                                      key={slot.id}
                                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer tabular-nums ${
                                        checked
                                          ? 'bg-[#14532d] text-white border-[#14532d]'
                                          : 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleTutorInquiryArray('weekdaySlots', slot.id)
                                        }
                                        className="sr-only"
                                      />
                                      <span>{slot.en}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-white border border-[#bbf7d0]">
                              <p className="text-xs font-bold text-[#14532d] mb-2">
                                Weekend Slots (max {tutorInquiryDraft.hoursPerDay})
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {WEEKEND_SLOTS.map((slot) => {
                                  const checked = tutorInquiryDraft.weekendSlots.includes(slot.id);
                                  return (
                                    <label
                                      key={slot.id}
                                      className={`flex items-center justify-center px-2 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer tabular-nums ${
                                        checked
                                          ? 'bg-[#14532d] text-white border-[#14532d]'
                                          : 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleTutorInquiryArray('weekendSlots', slot.id)
                                        }
                                        className="sr-only"
                                      />
                                      <span>{slot.en.replace(' (Ethiopian Time)', '')}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-3 border-t border-[#bbf7d0] flex flex-wrap items-center justify-between gap-4">
                          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532d] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={tutorInquiryDraft.excludeMatched}
                              onChange={(e) =>
                                setTutorInquiryDraft({
                                  ...tutorInquiryDraft,
                                  excludeMatched: e.target.checked,
                                })
                              }
                              className="w-4 h-4 accent-[#14532d]"
                            />
                            <span>Exclude Already Confirmed Matched Parents</span>
                          </label>

                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              onClick={handleResetTutorInquiry}
                              className="min-h-[42px] px-4 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold hover:bg-[#f0fdf4] cursor-pointer"
                            >
                              Reset
                            </button>
                            <button
                              type="submit"
                              className="min-h-[42px] px-6 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold hover:bg-[#166534] inline-flex items-center gap-2 shadow cursor-pointer"
                            >
                              <Search className="w-4 h-4" aria-hidden="true" />
                              <span>Find Perfect Parent Matches</span>
                            </button>
                          </div>
                        </div>
                      </form>

                      {appliedTutorInquiry && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#dcfce7]">
                            <h3 className="text-xl font-bold text-[#14532d] flex items-center gap-2">
                              <Award className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                              <span>
                                Ranked Perfect Parents ({parentFinderResults.length} evaluated)
                              </span>
                            </h3>
                            <span className="text-xs font-bold text-[#15803d]">
                              Sorted from 100% Perfect Match downwards
                            </span>
                          </div>

                          {parentFinderResults.length === 0 ? (
                            <div className="p-8 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-center text-sm text-[#475569]">
                              No active submitted parents match your current filter.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {parentFinderResults.map((item, idx) => {
                                const p = item.parent;
                                const tierBadge =
                                  item.tier === 'perfect'
                                    ? {
                                        text: 'PERFECT MATCH',
                                        cls: 'bg-[#14532d] text-white border-[#14532d]',
                                      }
                                    : item.tier === 'strong'
                                    ? {
                                        text: 'STRONG MATCH',
                                        cls: 'bg-[#dcfce7] text-[#14532d] border-[#16a34a]',
                                      }
                                    : {
                                        text: 'PARTIAL MATCH',
                                        cls: 'bg-amber-50 text-amber-900 border-amber-300',
                                      };
                                return (
                                  <div
                                    key={p.id}
                                    className={`p-5 rounded-2xl border-2 space-y-3 ${
                                      item.tier === 'perfect'
                                        ? 'bg-[#f0fdf4] border-[#14532d] shadow-sm'
                                        : 'bg-white border-[#bbf7d0]'
                                    }`}
                                  >
                                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                      <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="px-2.5 py-1 rounded-lg bg-[#14532d] text-white text-xs font-extrabold tabular-nums">
                                            #{idx + 1} &middot; {item.score}%
                                          </span>
                                          <span
                                            className={`px-2.5 py-0.5 rounded-lg border text-xs font-extrabold ${tierBadge.cls}`}
                                          >
                                            {tierBadge.text}
                                          </span>
                                          <span className="text-lg font-bold text-[#14532d] font-amharic">
                                            {p.parentProfile.fullName}
                                          </span>
                                          <span className="text-sm tabular-nums text-[#475569]">
                                            {p.parentProfile.phone}
                                          </span>
                                        </div>

                                        <p className="text-xs sm:text-sm text-[#0f172a]">
                                          <strong>{lookupLoc(p.parentProfile.location)}</strong>{' '}
                                          &middot; {p.kids.length} kid(s):{' '}
                                          {p.kids.map((k) => lookupGrade(k.gradeLevel)).join(', ')}{' '}
                                          &middot; Mode: {p.tutorPreference.mode}
                                        </p>

                                        <div className="flex flex-wrap gap-2 pt-1">
                                          {item.checks.map((chk) => (
                                            <span
                                              key={chk.label}
                                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                                                chk.ok
                                                  ? 'bg-white border-[#22c55e] text-[#14532d]'
                                                  : 'bg-amber-50 border-amber-300 text-amber-900'
                                              }`}
                                            >
                                              <span>{chk.ok ? '✓' : '⚠'}</span>
                                              <span>
                                                <strong>{chk.label}:</strong> {chk.detail}
                                              </span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        {p.summaryPdfFileId && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openPdfInspector(
                                                p.summaryPdfFileId!,
                                                `${p.parentProfile.fullName} — Amharic Parent PDF`
                                              )
                                            }
                                            className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                                          >
                                            <FileText className="w-4 h-4" aria-hidden="true" />
                                            <span>View Parent PDF</span>
                                          </button>
                                        )}

                                        {!confirmedParentIds.has(p.id) && (
                                          <button
                                            type="button"
                                            disabled={confirmingParentId === p.id}
                                            onClick={() => handleConfirmParentFromTutorFinder(item)}
                                            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#14532d] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                                          >
                                            <Handshake className="w-4 h-4" aria-hidden="true" />
                                            <span>
                                              {confirmingParentId === p.id
                                                ? 'Confirming...'
                                                : 'Confirm Match & Save'}
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 6: SETTINGS */}
              {tab === 'settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Editable Owner Password */}
                  <div className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-[#14532d] flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                        <span>Edit Owner Access Password</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowEditPws((s) => !s)}
                        className="text-xs font-bold text-[#15803d] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {showEditPws ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        <span>{showEditPws ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-[#475569]">
                      Change your Owner Access password anytime. Passwords are stored securely with
                      salted cryptographic hashing.
                    </p>

                    {pwMessage && (
                      <div
                        role="alert"
                        className={`p-3 rounded-xl border text-xs font-bold ${
                          pwMessage.type === 'ok'
                            ? 'bg-white border-[#16a34a] text-[#14532d]'
                            : 'bg-[#fef2f2] border-[#fca5a5] text-[#dc2626]'
                        }`}
                      >
                        {pwMessage.text}
                      </div>
                    )}

                    <form onSubmit={handleUpdatePasscode} className="space-y-3">
                      <div>
                        <label
                          htmlFor="cur-owner-pw"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Current Owner Password
                        </label>
                        <input
                          id="cur-owner-pw"
                          type={showEditPws ? 'text' : 'password'}
                          required
                          value={currentPw}
                          onChange={(e) => setCurrentPw(e.target.value)}
                          placeholder="Enter current password"
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="new-owner-pw"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          New Owner Password (min 6 chars)
                        </label>
                        <input
                          id="new-owner-pw"
                          type={showEditPws ? 'text' : 'password'}
                          required
                          value={newPw}
                          onChange={(e) => setNewPw(e.target.value)}
                          placeholder="Enter new password"
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="confirm-owner-pw"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Confirm New Password
                        </label>
                        <input
                          id="confirm-owner-pw"
                          type={showEditPws ? 'text' : 'password'}
                          required
                          value={confirmPw}
                          onChange={(e) => setConfirmPw(e.target.value)}
                          placeholder="Re-enter new password"
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingPw}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                      >
                        {savingPw ? 'Saving...' : 'Save New Owner Password'}
                      </button>
                    </form>
                  </div>

                  {/* Opening Picture Uploader */}
                  <div className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-4">
                    <h2 className="text-lg font-bold text-[#14532d] flex items-center gap-2">
                      <ImagePlus className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                      <span>Opening Page Picture Customizer</span>
                    </h2>
                    <p className="text-sm text-[#475569]">
                      Replace or reset the Ethiopian tutor &amp; students smiling portrait displayed
                      on the opening page.
                    </p>
                    {heroNotice && (
                      <p className="text-xs font-bold text-[#15803d]" role="status">
                        {heroNotice}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2.5 pt-2">
                      <label className="min-h-[42px] px-4 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-[#166534] cursor-pointer">
                        <ImagePlus className="w-4 h-4" aria-hidden="true" />
                        <span>Upload Opening Picture</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadCustomHero}
                          className="sr-only"
                        />
                      </label>
                      {hasCustomHero && (
                        <button
                          type="button"
                          onClick={handleResetHero}
                          className="min-h-[42px] px-4 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#f0fdf4] cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden="true" />
                          <span>Restore Default Photo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full-Screen PDF Inspection Modal */}
      {inspectPdfUrl && (
        <div
          className="fixed inset-0 z-[60] bg-[#14532d] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={inspectPdfTitle}
        >
          <div className="px-5 py-3.5 bg-[#14532d] text-white border-b-2 border-[#22c55e] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setInspectPdfUrl(null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#14532d] font-bold text-sm hover:bg-[#f0fdf4] shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Back</span>
              </button>
              <h3 className="font-bold text-base truncate">{inspectPdfTitle}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={inspectPdfUrl}
                download="askuala-application.pdf"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22c55e] text-[#14532d] font-bold text-xs hover:bg-[#86efac]"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download PDF</span>
              </a>
              <button
                type="button"
                onClick={() => setInspectPdfUrl(null)}
                aria-label="Close PDF preview"
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#166534] cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#f0fdf4] p-4 sm:p-6 space-y-5">
            {loadingPdfPages ? (
              <div className="max-w-3xl mx-auto p-10 rounded-xl bg-white border-2 border-[#22c55e] text-center font-bold text-[#14532d]">
                Rendering all embedded PDF pages...
              </div>
            ) : inspectPdfPages.length > 0 ? (
              <div className="max-w-4xl mx-auto space-y-5">
                {inspectPdfPages.map((pg, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl overflow-hidden border-2 border-[#14532d] shadow-md bg-white"
                  >
                    <div className="px-4 py-2 bg-[#f0fdf4] border-b border-[#bbf7d0] flex items-center justify-between text-xs font-bold text-[#14532d]">
                      <span>{pg.caption}</span>
                      <span className="tabular-nums">
                        Page {idx + 1} of {inspectPdfPages.length}
                      </span>
                    </div>
                    <img src={pg.url} alt={pg.caption} className="w-full h-auto block" />
                  </div>
                ))}
              </div>
            ) : (
              <iframe
                src={inspectPdfUrl}
                title={inspectPdfTitle}
                className="w-full h-full min-h-[75vh] bg-white rounded-xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
