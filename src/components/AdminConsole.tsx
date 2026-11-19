import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
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
  X,
  XCircle,
} from 'lucide-react';
import {
  ADDIS_LOCATIONS,
  EDUCATION_LEVEL_LABELS,
  formatFeeTierLabel,
  SUBJECTS,
} from '../data/catalog';
import {
  changeOwnerPasscode,
  createAdminMatch,
  fetchAdminOverview,
  getPdfBytes,
  isStandaloneFileMode,
  resolvePdfViewUrl,
  unlockOwnerWithPasscode,
  updateTutorAdminStatus,
  type AuthResponse,
} from '../utils/api';
import { renderPdfBytesToPngUrls, type PreviewPageItem } from '../utils/pdfComposer';
import type { MatchRecord, ParentApplication, TutorApplication, UserAccount } from '../types/app';

interface AdminConsoleProps {
  user: UserAccount | null;
  onAuthenticatedAdmin?: (res: AuthResponse) => void;
  onHeroUpdated?: () => void;
  onBackHome: () => void;
}

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

  const [tab, setTab] = useState<'tutors' | 'parents' | 'matches' | 'settings'>('tutors');
  const [tutors, setTutors] = useState<TutorApplication[]>([]);
  const [parents, setParents] = useState<ParentApplication[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [tutorFilter, setTutorFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedTutorId, setSelectedTutorId] = useState<string>('');

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

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOverview();
      setTutors(res.tutors);
      setParents(res.parents);
      setMatches(res.matches);
      if (res.parents.length > 0 && !selectedParentId) setSelectedParentId(res.parents[0].id);
      if (res.tutors.length > 0 && !selectedTutorId) setSelectedTutorId(res.tutors[0].id);
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

  const handleManualPair = async () => {
    if (!selectedParentId || !selectedTutorId) return;
    try {
      await createAdminMatch(selectedParentId, selectedTutorId);
      await loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
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
    return tutors.filter((t) => {
      if (tutorFilter !== 'all' && t.status !== tutorFilter) return false;
      if (!q) return true;
      return (
        t.profile.fullName.toLowerCase().includes(q) ||
        t.profile.phone.toLowerCase().includes(q) ||
        t.profile.preferredLocations.some((l) => lookupLoc(l).toLowerCase().includes(q))
      );
    });
  }, [tutors, tutorFilter, searchQuery]);

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
                  Enter your owner password to review Tutor PDFs, match families, and manage settings.
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
          {/* Top Exit Bar */}
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
                Owner Coordinator &amp; Matching Console
              </h1>
              <p className="text-[#475569] mt-1">
                Only you control matching &mdash; inspect Tutor unified PDFs, verify &ge; 87%
                transcripts, pair families with tutors, and edit your owner password.
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
              { label: 'Tutor Applications', value: tutors.length },
              {
                label: 'Verified Tutors',
                value: tutors.filter((t) => t.status === 'verified').length,
              },
              { label: 'Parent Requests', value: parents.length },
              { label: 'Confirmed Matches', value: matches.length },
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
                { id: 'tutors', label: 'Tutor Applications & PDFs' },
                { id: 'parents', label: 'Parent Applications' },
                { id: 'matches', label: 'Owner Match Pairing' },
                { id: 'settings', label: 'Password & Site Settings' },
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

          {loading ? (
            <div className="white-card p-10 text-center text-[#14532d] font-bold">
              Loading coordinator records...
            </div>
          ) : (
            <div className="white-card p-6">
              {tab === 'tutors' && (
                <div className="space-y-4">
                  <div className="instruction-box">
                    <FileText className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Review each tutor&apos;s unified application dossier PDF (containing entered
                      records plus embedded transcript PDFs) before verifying.
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
                    <p className="text-sm text-[#475569]">No tutor applications match your filter.</p>
                  ) : (
                    <div className="divide-y divide-[#dcfce7]">
                      {filteredTutors.map((t) => {
                        const pdfId = t.mergedPdfFileId || t.uploadedDocuments[0]?.fileId;
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
                                <span aria-hidden="true">&middot;</span>
                                <span className="font-bold uppercase text-xs px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#22c55e] text-[#14532d]">
                                  {t.status}
                                </span>
                              </div>
                              <p className="text-sm text-[#0f172a]">
                                {EDUCATION_LEVEL_LABELS[t.profile.educationLevel]} &middot;{' '}
                                {t.profile.preferredLocations.map(lookupLoc).join(', ')}
                              </p>
                              <p className="text-xs text-[#475569]">
                                Subjects: {t.profile.preferredSubjects.map(lookupSubj).join(', ')}{' '}
                                &middot; Fee: {formatFeeTierLabel(t.profile.expectedFeePerHour)}
                                {t.agreedToTerms ? ' · Agreed Terms ✓' : ''}
                              </p>
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
                                className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-red-300 bg-white text-red-800 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-red-50 cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" aria-hidden="true" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {tab === 'parents' && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-[#14532d]">
                    Parent Applications (Amharic Intake)
                  </h2>
                  {parents.length === 0 ? (
                    <p className="text-sm text-[#475569]">No parent applications submitted yet.</p>
                  ) : (
                    <div className="divide-y divide-[#dcfce7]">
                      {parents.map((p) => (
                        <div
                          key={p.id}
                          className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                              <span aria-hidden="true">&middot;</span>
                              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#22c55e] text-[#14532d]">
                                {p.status}
                              </span>
                            </div>
                            <p className="text-sm text-[#0f172a]">
                              Location: {lookupLoc(p.parentProfile.location)} &middot; Kids:{' '}
                              {p.kids.length} &middot; Preferred Mode: {p.tutorPreference.mode}
                            </p>
                          </div>
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'matches' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-[#f0fdf4] border-2 border-[#22c55e] space-y-3">
                    <h2 className="text-lg font-bold text-[#14532d]">
                      Confirm or Manually Pair a Parent &amp; Tutor
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <select
                        value={selectedParentId}
                        onChange={(e) => setSelectedParentId(e.target.value)}
                        aria-label="Select Parent"
                        className="min-h-[42px] px-3 py-2 rounded-xl border-2 border-[#cbd5e1] bg-white font-amharic text-[#0f172a]"
                      >
                        {parents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.parentProfile.fullName} ({lookupLoc(p.parentProfile.location)})
                          </option>
                        ))}
                      </select>

                      <select
                        value={selectedTutorId}
                        onChange={(e) => setSelectedTutorId(e.target.value)}
                        aria-label="Select Tutor"
                        className="min-h-[42px] px-3 py-2 rounded-xl border-2 border-[#cbd5e1] bg-white text-[#0f172a]"
                      >
                        {tutors.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.profile.fullName} ({t.status})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleManualPair}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-[#14532d] text-white font-bold hover:bg-[#166534] inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Handshake className="w-4 h-4" aria-hidden="true" />
                        <span>Confirm Pairing</span>
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-[#dcfce7]">
                    {matches.length === 0 ? (
                      <p className="text-sm text-[#475569]">No matches computed yet.</p>
                    ) : (
                      matches.map((m) => (
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
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-[#15803d]">
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            <span>{m.status}</span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

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
                      Change your hidden Owner Access password anytime. Your updated password takes
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
                      Replace or reset the Ethiopian tutor &amp; father photograph displayed on the
                      opening Home page.
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
              <div className="max-w-4xl mx-auto space-y-4">
                {inspectPdfPages.map((pg, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl overflow-hidden border-2 border-[#14532d] shadow-md bg-white"
                  >
                    <img src={pg.url} alt={pg.caption} className="w-full h-auto block" />
                  </div>
                ))}
              </div>
            ) : (
              <iframe src={inspectPdfUrl} title={inspectPdfTitle} className="w-full h-full min-h-[75vh] bg-white rounded-xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
