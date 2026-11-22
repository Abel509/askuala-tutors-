import React, { useEffect, useMemo, useState } from 'react';
import {
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
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlink,
  X,
  XCircle,
} from 'lucide-react';
import {
  ADDIS_LOCATIONS,
  DAYS_OF_WEEK,
  EDUCATION_LEVEL_LABELS,
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
  rankTutorsForParentCriteria,
  type OwnerParentSearchCriteria,
  type RankedTutorMatch,
} from '../utils/tutorMatcher';
import type {
  AdminParentItem,
  AdminTutorItem,
  MatchRecord,
  TutorApplication,
  UserAccount,
} from '../types/app';

interface AdminConsoleProps {
  user: UserAccount | null;
  onAuthenticatedAdmin?: (res: AuthResponse) => void;
  onHeroUpdated?: () => void;
  onBackHome: () => void;
}

const DEFAULT_FINDER_CRITERIA: OwnerParentSearchCriteria = {
  parentName: '',
  parentPhone: '',
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

  const [tab, setTab] = useState<'finder' | 'tutors' | 'matches' | 'parents' | 'settings'>('finder');
  const [tutors, setTutors] = useState<AdminTutorItem[]>([]);
  const [parents, setParents] = useState<AdminParentItem[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Parent-Requirement Perfect-Match Finder State
  const [finderDraft, setFinderDraft] = useState<OwnerParentSearchCriteria>(DEFAULT_FINDER_CRITERIA);
  const [appliedCriteria, setAppliedCriteria] = useState<OwnerParentSearchCriteria | null>(null);
  const [showFinderSlots, setShowFinderSlots] = useState(false);
  const [confirmingFinderTutorId, setConfirmingFinderTutorId] = useState<string | null>(null);

  // Filters
  const [tutorFilter, setTutorFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');
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
    () => tutors.filter((t) => !confirmedTutorIds.has(t.id)),
    [tutors, confirmedTutorIds]
  );
  const activeParents = useMemo(
    () => parents.filter((p) => !confirmedParentIds.has(p.id) && p.status !== 'matched'),
    [parents, confirmedParentIds]
  );

  const finderResults: RankedTutorMatch[] = useMemo(() => {
    if (!appliedCriteria) return [];
    return rankTutorsForParentCriteria(tutors, confirmedTutorIds, appliedCriteria);
  }, [tutors, confirmedTutorIds, appliedCriteria]);

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
    setFinderDraft((prev) => {
      const arr = prev[field];
      const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
      return { ...prev, [field]: next };
    });
  };

  const handleRunFinderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusBanner(null);
    setAppliedCriteria({ ...finderDraft });
  };

  const handleResetFinder = () => {
    setFinderDraft(DEFAULT_FINDER_CRITERIA);
    setAppliedCriteria(null);
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
        parentName: criteria.parentName.trim() || 'Parent Request (Owner Match)',
        parentPhone: criteria.parentPhone.trim() || undefined,
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
      tutors,
      parents,
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
                  Enter your owner password to search perfect tutor matches for parent requests,
                  review Tutor PDFs, view applicant passwords, and confirm matches.
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
                Owner Coordinator &amp; Perfect Match Console
              </h1>
              <p className="text-[#475569] mt-1">
                Enter parent criteria in <strong>Find Perfect Tutor</strong> to rank applicants from
                100% Perfect Match downwards, inspect crisp PDFs, and manage confirmed matches.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {!isStandaloneFileMode() && (
                <a
                  href="/api/download-single-html"
                  download="index.html"
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#15803d] text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-[#14532d] transition-colors"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Download Single index.html</span>
                </a>
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
              { label: 'Active Unmatched Tutors', value: activeTutors.length },
              {
                label: 'Active Verified Tutors',
                value: activeTutors.filter((t) => t.status === 'verified').length,
              },
              { label: 'Confirmed Matches', value: confirmedMatches.length },
              { label: 'All Saved Parent Requests', value: parents.length },
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

          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: 'finder',
                  label: 'Find Perfect Tutor (Parent Search)',
                },
                {
                  id: 'tutors',
                  label: `Active Tutors (${activeTutors.length})`,
                },
                {
                  id: 'matches',
                  label: `Confirmed Matches (${confirmedMatches.length})`,
                },
                {
                  id: 'parents',
                  label: `Saved Parents (${activeParents.length})`,
                },
                {
                  id: 'settings',
                  label: 'Password & Picture Settings',
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold cursor-pointer border-2 transition-colors ${
                  tab === t.id
                    ? 'bg-[#14532d] text-white border-[#ffffff]'
                    : 'bg-white text-[#14532d] border-[#14532d] hover:bg-[#f0fdf4]'
                }`}
              >
                {t.label}
              </button>
            ))}
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
              {/* TAB 1: FIND PERFECT TUTOR BY PARENT CRITERIA */}
              {tab === 'finder' && (
                <div className="space-y-6">
                  <div className="instruction-box">
                    <SlidersHorizontal className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Enter the requirements of a parent looking for a tutor (location, subjects
                      needed, number and grade of students, hourly fee, days per week, and hours per
                      day), then click <strong>Search Perfect Matches</strong> to rank all active
                      tutors from 100% Perfect Match downwards.
                    </span>
                  </div>

                  <form
                    onSubmit={handleRunFinderSearch}
                    className="p-5 rounded-2xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-5"
                  >
                    {/* Row 1: Optional Family Reference */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label
                          htmlFor="finder-parent-name"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Parent Name (Optional — for saving match)
                        </label>
                        <input
                          id="finder-parent-name"
                          type="text"
                          value={finderDraft.parentName}
                          onChange={(e) =>
                            setFinderDraft({ ...finderDraft, parentName: e.target.value })
                          }
                          placeholder="e.g. Ato Tadesse / Family Name"
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="finder-parent-phone"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Parent Phone (Optional)
                        </label>
                        <input
                          id="finder-parent-phone"
                          type="tel"
                          value={finderDraft.parentPhone}
                          onChange={(e) =>
                            setFinderDraft({ ...finderDraft, parentPhone: e.target.value })
                          }
                          placeholder="09XXXXXXXX"
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm tabular-nums"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="finder-location"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Parent Location (Addis Ababa)
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
                          Tutoring Mode Needed
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
                          <option value="any">Any Mode (In-Person or Online)</option>
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Students Count, Fee, Sex, Days/Wk, Hours/Day */}
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
                            setFinderDraft({ ...finderDraft, kidsCount: Number(e.target.value) })
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
                          htmlFor="finder-fee"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Parent Hourly Fee Budget
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

                      <div>
                        <label
                          htmlFor="finder-sex"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Preferred Tutor Sex
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
                          htmlFor="finder-min-days"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Days per Week Needed
                        </label>
                        <select
                          id="finder-min-days"
                          value={finderDraft.minDaysPerWeek}
                          onChange={(e) =>
                            setFinderDraft({
                              ...finderDraft,
                              minDaysPerWeek: Number(e.target.value),
                            })
                          }
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                        >
                          <option value={0}>Any / Use Specific Days Below</option>
                          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                            <option key={d} value={d}>
                              At least {d} day{d > 1 ? 's' : ''}/week
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="finder-hours"
                          className="block text-xs font-bold text-[#14532d] mb-1"
                        >
                          Hours per Day Needed
                        </label>
                        <select
                          id="finder-hours"
                          value={finderDraft.hoursPerDay}
                          onChange={(e) =>
                            setFinderDraft({
                              ...finderDraft,
                              hoursPerDay: e.target.value as OwnerParentSearchCriteria['hoursPerDay'],
                            })
                          }
                          className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold tabular-nums"
                        >
                          <option value="any">Any Duration</option>
                          <option value="1">1 hour / day</option>
                          <option value="2">2 hours / day</option>
                          <option value="3">3 hours / day</option>
                        </select>
                      </div>
                    </div>

                    {/* Row 3: Student Grade Levels */}
                    <fieldset>
                      <legend className="text-xs font-bold text-[#14532d] mb-2">
                        Grade Level(s) of Student(s) ({finderDraft.gradeLevels.length} selected)
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

                    {/* Row 4: Subjects Needed */}
                    <fieldset>
                      <legend className="text-xs font-bold text-[#14532d] mb-2">
                        Subjects Needed ({finderDraft.subjects.length} selected)
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

                    {/* Row 5: Specific Days of the Week */}
                    <fieldset>
                      <legend className="text-xs font-bold text-[#14532d] mb-2">
                        Specific Preferred Days ({finderDraft.selectedDays.length} selected)
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
                                  : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#22c55e]'
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

                    {/* Optional Specific Ethiopian Time Slots */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowFinderSlots((s) => !s)}
                        className="text-xs font-bold text-[#15803d] underline underline-offset-4 hover:text-[#14532d] cursor-pointer"
                      >
                        {showFinderSlots
                          ? '− Hide Specific Ethiopian Time Slots'
                          : '+ Filter by Specific Ethiopian Time Slots (Optional)'}
                      </button>

                      {showFinderSlots && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-3 rounded-xl bg-white border border-[#bbf7d0]">
                            <p className="text-xs font-bold text-[#14532d] mb-2">
                              Weekday Slots (Ethiopian Time)
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
                              Weekend Slots (Ethiopian Time)
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
                    </div>

                    {/* Toggles + Action Buttons */}
                    <div className="pt-3 border-t border-[#bbf7d0] flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#14532d]">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={finderDraft.verifiedOnly}
                            onChange={(e) =>
                              setFinderDraft({ ...finderDraft, verifiedOnly: e.target.checked })
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
                              setFinderDraft({ ...finderDraft, excludeMatched: e.target.checked })
                            }
                            className="w-4 h-4 accent-[#14532d]"
                          />
                          <span>Exclude Already Confirmed Matched Tutors</span>
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={handleResetFinder}
                          className="min-h-[42px] px-4 py-2 rounded-xl border-2 border-[#14532d] bg-white text-[#14532d] text-sm font-bold hover:bg-[#f0fdf4] cursor-pointer"
                        >
                          Reset Criteria
                        </button>
                        <button
                          type="submit"
                          className="min-h-[42px] px-6 py-2 rounded-xl bg-[#14532d] text-white text-sm font-bold hover:bg-[#166534] inline-flex items-center gap-2 shadow cursor-pointer"
                        >
                          <Search className="w-4 h-4" aria-hidden="true" />
                          <span>Search Perfect Matches</span>
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Search Results Ranked from Perfect Match Downward */}
                  {appliedCriteria && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#dcfce7]">
                        <h2 className="text-xl font-bold text-[#14532d] flex items-center gap-2">
                          <Award className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                          <span>
                            Ranked Tutor Matches ({finderResults.length} applicant
                            {finderResults.length === 1 ? '' : 's'} evaluated)
                          </span>
                        </h2>
                        <span className="text-xs font-bold text-[#15803d]">
                          Sorted from Perfect Match (100%) downwards
                        </span>
                      </div>

                      {finderResults.length === 0 ? (
                        <div className="p-8 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-center text-sm text-[#475569]">
                          No active tutors match your current pool filter (try unchecking
                          &ldquo;Verified Tutors Only&rdquo; or check the Active Tutors tab).
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {finderResults.map((item, idx) => {
                            const t = item.tutor;
                            const pdfId = t.mergedPdfFileId || t.uploadedDocuments[0]?.fileId;
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
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleCopyText(`finder_phone_${t.id}`, t.profile.phone)
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#bbf7d0] text-[11px] font-bold text-[#14532d] hover:bg-[#dcfce7] cursor-pointer"
                                      >
                                        {copiedKey === `finder_phone_${t.id}` ? (
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
                                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-white border border-[#22c55e] text-[#14532d]">
                                        {t.status}
                                      </span>
                                    </div>

                                    <p className="text-xs sm:text-sm text-[#0f172a]">
                                      <strong>{EDUCATION_LEVEL_LABELS[t.profile.educationLevel]}</strong>{' '}
                                      &middot; Sex: {t.profile.sex} &middot; Fee:{' '}
                                      {formatFeeTierLabel(t.profile.expectedFeePerHour)}
                                      {t.academicRecords.esslceOutOf600
                                        ? ` · ESSLCE: ${t.academicRecords.esslceOutOf600}/600`
                                        : ''}
                                      {t.academicRecords.graduationCgpa
                                        ? ` · CGPA: ${t.academicRecords.graduationCgpa}`
                                        : ''}
                                    </p>

                                    {/* Criterion Breakdown Chips */}
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

              {/* TAB 2: ACTIVE UNMATCHED TUTORS */}
              {tab === 'tutors' && (
                <div className="space-y-4">
                  <div className="instruction-box">
                    <FileText className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Showing only <strong>active unmatched</strong> tutors. Confirmed matched
                      tutors are listed under the <strong>Confirmed Matches</strong> tab. You can
                      inspect PDFs, view/reset forgotten passwords, verify/reject, or delete
                      permanently.
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
                      No unmatched tutor applications match your filter.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#dcfce7]">
                      {filteredTutors.map((t) => {
                        const pdfId = t.mergedPdfFileId || t.uploadedDocuments[0]?.fileId;
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
                                {t.academicRecords.esslceOutOf600
                                  ? ` · ESSLCE: ${t.academicRecords.esslceOutOf600}/600`
                                  : ''}
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

              {/* TAB 3: CONFIRMED & SAVED MATCHES */}
              {tab === 'matches' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-[#dcfce7] border-2 border-[#14532d] space-y-3">
                    <h2 className="text-lg font-bold text-[#14532d] flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                      <span>Confirmed Matches ({confirmedMatches.length})</span>
                    </h2>
                    {confirmedMatches.length === 0 ? (
                      <p className="text-sm text-[#14532d]">
                        No confirmed matches yet. Use <strong>Find Perfect Tutor</strong> or manual
                        pairing below to confirm a match.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {confirmedMatches.map((m) => (
                          <div
                            key={m.id}
                            className="p-3.5 rounded-xl bg-white border border-[#22c55e] flex flex-wrap items-center justify-between gap-3"
                          >
                            <div>
                              <p className="font-bold text-[#14532d]">
                                <span className="font-amharic">{m.parentName}</span> ({m.parentPhone}
                                ) &harr; {m.tutorName} ({m.tutorPhone})
                              </p>
                              <p className="text-xs text-[#475569] tabular-nums">
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

                  {/* Manual Pairing (Unmatched Applicants Only) */}
                  <div className="p-4 rounded-xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-3">
                    <h2 className="text-lg font-bold text-[#14532d]">
                      Manually Pair Saved Unmatched Parent &amp; Tutor
                    </h2>
                    {activeParents.length === 0 || activeTutors.length === 0 ? (
                      <p className="text-sm text-[#475569]">
                        Use the <strong>Find Perfect Tutor</strong> tab to search and confirm
                        matches for incoming parent inquiries directly!
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

                  {/* Auto-Suggested Matches */}
                  {suggestedMatches.length > 0 && (
                    <div className="divide-y divide-[#dcfce7]">
                      <h3 className="text-base font-bold text-[#14532d] pb-2">
                        Auto-Suggested Compatibility Pairs ({suggestedMatches.length})
                      </h3>
                      {suggestedMatches.map((m) => (
                        <div
                          key={m.id}
                          className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-bold text-[#14532d]">
                              <span className="font-amharic">{m.parentName}</span> ({m.parentPhone})
                              &harr; {m.tutorName} ({m.tutorPhone})
                            </p>
                            <p className="text-xs text-[#475569] tabular-nums">
                              {m.compatibilityScore}% compatibility &middot;{' '}
                              {lookupLoc(m.parentLocation)} &middot;{' '}
                              {m.matchedSubjects.map(lookupSubj).join(', ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleManualPair(m.parentAppId, m.tutorAppId)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#14532d] text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#166534] cursor-pointer"
                          >
                            <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Confirm Match</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SAVED PARENTS */}
              {tab === 'parents' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-[#14532d]">
                        Active Unmatched Saved Parents
                      </h2>
                      <p className="text-xs text-[#475569]">
                        Confirmed matched families appear in the Confirmed Matches tab.
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
                      No unmatched parent records right now.
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
                                {p.kids.length} &middot; Preferred Mode: {p.tutorPreference.mode}
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

              {/* TAB 5: PASSWORD & PICTURE SETTINGS */}
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
                        Change your Owner Access password anytime. Your updated password takes
                        effect immediately.
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
                        Replace or reset the Ethiopian tutor photograph displayed on the opening
                        landing page.
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
