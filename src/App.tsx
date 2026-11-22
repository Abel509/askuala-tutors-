/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { AdminConsole } from './components/AdminConsole';
import { AuthModal } from './components/AuthModal';
import { OpeningPage } from './components/OpeningPage';
import { ParentPortal } from './components/ParentPortal';
import { TutorPortal } from './components/TutorPortal';
import type {
  ParentApplication,
  SiteMode,
  TutorApplication,
  UserAccount,
  UserRole,
} from './types/app';
import {
  fetchCurrentSession,
  logoutAccount,
  setStoredToken,
  type AuthResponse,
} from './utils/api';
import { detectSiteMode } from './utils/portalMode';

type ActiveView = 'home' | 'auth' | 'tutor' | 'parent' | 'admin';

export default function App() {
  const [siteMode] = useState<SiteMode>(() => detectSiteMode());
  const [view, setView] = useState<ActiveView>(() =>
    detectSiteMode() === 'owner' ? 'admin' : 'home'
  );
  const [user, setUser] = useState<UserAccount | null>(null);
  const [tutorApp, setTutorApp] = useState<TutorApplication | null>(null);
  const [parentApp, setParentApp] = useState<ParentApplication | null>(null);
  const [booting, setBooting] = useState(true);
  const [heroRefreshKey, setHeroRefreshKey] = useState(0);

  const lockedApplicantRole: 'tutor' | 'parent' | undefined =
    siteMode === 'tutor' ? 'tutor' : siteMode === 'parent' ? 'parent' : undefined;

  const [authConfig, setAuthConfig] = useState<{
    mode: 'login' | 'register';
    role: UserRole;
  }>({
    mode: 'register',
    role: lockedApplicantRole || 'parent',
  });

  // Hidden 7-click Owner Access strictly on the main Hub footer (hidden on dedicated tutor/parent websites)
  const [ownerClicks, setOwnerClicks] = useState(0);
  const [ownerRevealed, setOwnerRevealed] = useState(false);
  const clickResetRef = useRef<number | null>(null);

  useEffect(() => {
    if (siteMode !== 'owner') {
      // Whenever the public link is clicked/opened, always start fresh as new (Sign In / Create Account)
      setStoredToken(null);
      setUser(null);
      setTutorApp(null);
      setParentApp(null);
      setBooting(false);
      return;
    }
    fetchCurrentSession()
      .then((res) => {
        if (res) {
          setUser(res.user);
          setTutorApp(res.tutorApplication);
          setParentApp(res.parentApplication);
        }
      })
      .finally(() => setBooting(false));
  }, [siteMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (siteMode === 'tutor') {
      document.title = 'ኣስኳላ Tutors – Tutor Application & Registration Portal';
      document.documentElement.lang = 'en';
    } else if (siteMode === 'owner') {
      document.title = 'ኣስኳላ – Owner Coordinator Console';
      document.documentElement.lang = 'en';
    } else {
      document.title = 'ኣስኳላ — የወላጆች ፖርታል | Parent Application Portal';
      document.documentElement.lang = 'am';
    }

    if (window.location.protocol === 'file:') return;
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonicalUrl;

    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.content = canonicalUrl;
  }, [siteMode]);

  const navigateHome = () => {
    setView(siteMode === 'owner' ? 'admin' : 'home');
    setOwnerRevealed(false);
    setOwnerClicks(0);
  };

  const openAuth = (mode: 'login' | 'register', role: UserRole = 'parent') => {
    setAuthConfig({ mode, role: lockedApplicantRole || role });
    setView('auth');
  };

  const handleStartPortal = (role: 'parent' | 'tutor') => {
    const targetRole = lockedApplicantRole || role;
    if (user && (user.role === targetRole || user.role === 'admin')) {
      setView(targetRole);
      return;
    }
    openAuth('register', targetRole);
  };

  const handleResumePortal = () => {
    if (!user) {
      openAuth('login', lockedApplicantRole || 'parent');
      return;
    }
    if (siteMode === 'owner') {
      setView('admin');
      return;
    }
    if (user.role === 'admin') setView('admin');
    else if (user.role === 'parent') setView('parent');
    else setView('tutor');
  };

  const handleAuthSuccess = (res: AuthResponse) => {
    setUser(res.user);
    setTutorApp(res.tutorApplication);
    setParentApp(res.parentApplication);

    if (res.user.role === 'admin') {
      setView('admin');
    } else if (res.user.role === 'parent') {
      setView('parent');
    } else {
      setView('tutor');
    }
  };

  const handleSignOut = async () => {
    await logoutAccount();
    setUser(null);
    setTutorApp(null);
    setParentApp(null);
    navigateHome();
  };

  const handleSecretCornerTap = () => {
    if (siteMode === 'owner') return;
    if (clickResetRef.current) {
      window.clearTimeout(clickResetRef.current);
    }
    const next = ownerClicks + 1;
    if (next >= 7) {
      setOwnerRevealed(true);
      setOwnerClicks(0);
    } else {
      setOwnerClicks(next);
      clickResetRef.current = window.setTimeout(() => {
        setOwnerClicks(0);
      }, 8000);
    }
  };

  const isAmharicHeader = siteMode === 'parent';

  return (
    <div
      lang={isAmharicHeader ? 'am' : 'en'}
      className={`min-h-screen flex flex-col bg-[#15803d] text-[#0f172a] ${
        isAmharicHeader ? 'font-amharic' : 'font-english'
      }`}
    >
      <a href="#main-content" className="skip-link">
        {isAmharicHeader ? 'ወደ ዋናው ይዘት ዝለል' : 'Skip to main content'}
      </a>

      {/* Sticky Deep Forest Green Header */}
      <header
        style={{ background: 'linear-gradient(90deg, #14532d, #166534)' }}
        className="sticky top-0 z-30 shrink-0 border-b-[3px] border-[#22c55e] shadow-md text-white no-print"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Wordmark (Returns to Site Home) */}
          <button
            type="button"
            onClick={navigateHome}
            className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="bg-white text-[#14532d] px-2.5 py-0.5 rounded-md font-amharic font-extrabold text-base sm:text-lg leading-tight shadow-sm">
              ኣስኳላ
            </span>
            <span>
              <span className="font-amharic">ኣስኳላ</span>{' '}
              {siteMode === 'parent'
                ? '— ወላጆች'
                : siteMode === 'owner'
                ? 'Owner Console'
                : 'Tutors'}
            </span>
          </button>

          {/* Navigation */}
          <nav aria-label="Primary navigation" className="flex items-center gap-4 text-sm font-bold">
            <button
              type="button"
              onClick={navigateHome}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer ${
                view === 'home' || (siteMode === 'owner' && view === 'admin')
                  ? 'text-white underline underline-offset-4'
                  : 'text-[#dcfce7]'
              }`}
            >
              {siteMode === 'parent' ? 'መነሻ' : siteMode === 'owner' ? 'Dashboard' : 'Home'}
            </button>
          </nav>

          {/* Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3.5 sm:px-4 py-2 rounded-xl bg-white text-[#14532d] text-xs sm:text-sm font-bold hover:bg-[#f0fdf4] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              >
                {isAmharicHeader ? 'ውጣ' : 'Sign Out'}
              </button>
            ) : siteMode === 'owner' ? null : (
              <button
                type="button"
                onClick={() => openAuth('login', lockedApplicantRole || 'parent')}
                className="px-3.5 sm:px-4 py-2 rounded-xl bg-white text-[#14532d] text-xs sm:text-sm font-bold hover:bg-[#f0fdf4] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              >
                {isAmharicHeader ? 'ግባ' : 'Sign In'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1">
        {booting && (
          <div className="max-w-3xl mx-auto px-4 py-20 text-center">
            <div className="white-card p-8 inline-block">
              <p className="text-lg font-bold text-[#14532d]">
                {isAmharicHeader ? (
                  'ኣስኳላ እየተከፈተ ነው...'
                ) : (
                  <>
                    Loading <span className="font-amharic">ኣስኳላ</span> Tutors...
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {!booting && view === 'home' && siteMode !== 'owner' && (
          <OpeningPage
            key={heroRefreshKey}
            user={user}
            siteMode={siteMode}
            onStartPortal={handleStartPortal}
            onOpenAuth={(mode, role) => openAuth(mode, lockedApplicantRole || role || 'tutor')}
            onResumePortal={handleResumePortal}
          />
        )}

        {!booting && view === 'auth' && siteMode !== 'owner' && (
          <AuthModal
            isOpen={true}
            initialMode={authConfig.mode}
            preselectedRole={authConfig.role}
            lockedRole={lockedApplicantRole}
            onClose={navigateHome}
            onSuccess={handleAuthSuccess}
          />
        )}

        {!booting && view === 'tutor' && user && (
          <TutorPortal
            user={user}
            existingApplication={tutorApp}
            onApplicationUpdated={(app) => setTutorApp(app)}
            onExitToHome={navigateHome}
            lockedPortal={siteMode === 'tutor'}
          />
        )}

        {!booting && view === 'parent' && user && (
          <ParentPortal
            user={user}
            existingApplication={parentApp}
            onApplicationUpdated={(app) => setParentApp(app)}
            onExitToHome={navigateHome}
            lockedPortal={siteMode === 'parent'}
          />
        )}

        {!booting && view === 'admin' && (
          <AdminConsole
            user={user}
            siteMode={siteMode}
            onAuthenticatedAdmin={(res) => {
              setUser(res.user);
              setTutorApp(res.tutorApplication);
              setParentApp(res.parentApplication);
            }}
            onHeroUpdated={() => setHeroRefreshKey((k) => k + 1)}
            onBackHome={navigateHome}
          />
        )}
      </main>

      {/* Crisp White Accessible Footer + Secret 7-Click Owner Access in Lower-Last-Right Corner */}
      <footer className="relative border-t-[3px] border-[#14532d] bg-white text-[#14532d] py-5 px-4 sm:px-6 lg:px-8 text-sm no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="font-bold">
              &copy; {new Date().getFullYear()} <span className="font-amharic">ኣስኳላ</span>{' '}
              {isAmharicHeader
                ? '— የወላጆች ፖርታል · አዲስ አበባ እና ኦንላይን አስጠኚ ማገናኛ'
                : 'Tutors · Addis Ababa & Online Tutor Portal'}
            </p>
            <p className="font-amharic text-xs text-[#15803d] font-semibold">
              {isAmharicHeader
                ? 'ለልጆችዎ ብቁ አስጠኚዎች · Verified Home & Online Tutors'
                : 'ለመምህራን የተከበረ ዕድል · Academic Excellence & Dedicated Tutoring'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 min-h-[36px] ml-auto">
            {siteMode !== 'owner' && view === 'home' && ownerRevealed && (
              <button
                type="button"
                onClick={() => setView('admin')}
                className="relative z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border-2 border-[#14532d] bg-[#f0fdf4] text-[#14532d] text-xs font-bold hover:bg-[#dcfce7] transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Owner Access</span>
              </button>
            )}
          </div>
        </div>

        {siteMode !== 'owner' && view === 'home' && !ownerRevealed && (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleSecretCornerTap}
            aria-hidden="true"
            className="absolute right-0 bottom-0 w-24 h-12 bg-transparent border-0 opacity-0 cursor-default select-none focus:outline-none z-10"
          />
        )}
      </footer>
    </div>
  );
}
