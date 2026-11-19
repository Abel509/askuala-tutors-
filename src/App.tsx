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
import type { ParentApplication, TutorApplication, UserAccount, UserRole } from './types/app';
import {
  fetchCurrentSession,
  logoutAccount,
  type AuthResponse,
} from './utils/api';

type ActiveView = 'home' | 'auth' | 'tutor' | 'parent' | 'admin';

export default function App() {
  const [view, setView] = useState<ActiveView>('home');
  const [user, setUser] = useState<UserAccount | null>(null);
  const [tutorApp, setTutorApp] = useState<TutorApplication | null>(null);
  const [parentApp, setParentApp] = useState<ParentApplication | null>(null);
  const [booting, setBooting] = useState(true);
  const [heroRefreshKey, setHeroRefreshKey] = useState(0);

  const [authConfig, setAuthConfig] = useState<{
    mode: 'login' | 'register';
    role: UserRole;
  }>({
    mode: 'register',
    role: 'tutor',
  });

  // Hidden 4-click Owner Access in the lower-last-right corner of Home footer
  const [ownerClicks, setOwnerClicks] = useState(0);
  const [ownerRevealed, setOwnerRevealed] = useState(false);
  const clickResetRef = useRef<number | null>(null);

  useEffect(() => {
    fetchCurrentSession()
      .then((res) => {
        if (res) {
          setUser(res.user);
          setTutorApp(res.tutorApplication);
          setParentApp(res.parentApplication);
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') return;
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
  }, []);

  const navigateHome = () => {
    setView('home');
    setOwnerRevealed(false);
    setOwnerClicks(0);
  };

  const openAuth = (mode: 'login' | 'register', role: UserRole = 'tutor') => {
    setAuthConfig({ mode, role });
    setView('auth');
  };

  const handleStartPortal = (role: 'parent' | 'tutor') => {
    if (user && (user.role === role || user.role === 'admin')) {
      setView(role);
      return;
    }
    openAuth('register', role);
  };

  const handleResumePortal = () => {
    if (!user) {
      openAuth('login', 'tutor');
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
    if (clickResetRef.current) {
      window.clearTimeout(clickResetRef.current);
    }
    const next = ownerClicks + 1;
    if (next >= 4) {
      setOwnerRevealed(true);
      setOwnerClicks(0);
    } else {
      setOwnerClicks(next);
      clickResetRef.current = window.setTimeout(() => {
        setOwnerClicks(0);
      }, 6000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#15803d] text-[#0f172a] font-english">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sticky Deep Forest Green Header — Only Home + Download + Sign In / Sign Out */}
      <header
        style={{ background: 'linear-gradient(90deg, #14532d, #166534)' }}
        className="sticky top-0 z-30 shrink-0 border-b-[3px] border-[#22c55e] shadow-md text-white no-print"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Wordmark (Returns Home) */}
          <button
            type="button"
            onClick={navigateHome}
            className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="bg-white text-[#14532d] px-2.5 py-0.5 rounded-md font-amharic font-extrabold text-base sm:text-lg leading-tight shadow-sm">
              ኣስኳላ
            </span>
            <span>
              <span className="font-amharic">ኣስኳላ</span> Tutors
            </span>
          </button>

          {/* Navigation — Only Home */}
          <nav aria-label="Primary navigation" className="flex items-center gap-4 text-sm font-bold">
            <button
              type="button"
              onClick={navigateHome}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer ${
                view === 'home' ? 'text-white underline underline-offset-4' : 'text-[#dcfce7]'
              }`}
            >
              Home
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
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth('login', 'tutor')}
                className="px-3.5 sm:px-4 py-2 rounded-xl bg-white text-[#14532d] text-xs sm:text-sm font-bold hover:bg-[#f0fdf4] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content — Exclusive view rendering so clicked pages cleanly replace Home */}
      <main id="main-content" className="flex-1">
        {booting && (
          <div className="max-w-3xl mx-auto px-4 py-20 text-center">
            <div className="white-card p-8 inline-block">
              <p className="text-lg font-bold text-[#14532d]">
                Loading <span className="font-amharic">ኣስኳላ</span> Tutors...
              </p>
            </div>
          </div>
        )}

        {!booting && view === 'home' && (
          <OpeningPage
            key={heroRefreshKey}
            user={user}
            onStartPortal={handleStartPortal}
            onOpenAuth={(mode, role) => openAuth(mode, role || 'tutor')}
            onResumePortal={handleResumePortal}
          />
        )}

        {!booting && view === 'auth' && (
          <AuthModal
            isOpen={true}
            initialMode={authConfig.mode}
            preselectedRole={authConfig.role}
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
          />
        )}

        {!booting && view === 'parent' && user && (
          <ParentPortal
            user={user}
            existingApplication={parentApp}
            onApplicationUpdated={(app) => setParentApp(app)}
            onExitToHome={navigateHome}
          />
        )}

        {!booting && view === 'admin' && (
          <AdminConsole
            user={user}
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

      {/* Crisp White Accessible Footer + Hidden 4-Click Owner Access in Lower-Last-Right Corner of Home */}
      <footer className="relative border-t-[3px] border-[#14532d] bg-white text-[#14532d] py-5 px-4 sm:px-6 lg:px-8 text-sm no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="font-bold">
              &copy; {new Date().getFullYear()} <span className="font-amharic">ኣስኳላ</span> Tutors
              &middot; Addis Ababa &amp; Online Tutoring Platform
            </p>
            <p className="font-amharic text-xs text-[#15803d] font-semibold">
              ለተማሪዎች ጥራት ያለው ትምህርት &middot; ለመምህራን የተከበረ ዕድል
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 min-h-[36px]">
            {view === 'home' && ownerRevealed && (
              <button
                type="button"
                onClick={() => setView('admin')}
                className="relative z-10 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border-2 border-[#14532d] bg-[#f0fdf4] text-[#14532d] text-xs font-bold hover:bg-[#dcfce7] transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Owner Access</span>
              </button>
            )}
          </div>
        </div>

        {/* Invisible 4-click spot covering the lower last right corner of Home */}
        {view === 'home' && !ownerRevealed && (
          <button
            type="button"
            onClick={handleSecretCornerTap}
            aria-label="Footer corner"
            className="absolute right-0 bottom-0 w-44 h-full bg-transparent border-0 opacity-0 cursor-default select-none focus:outline-none"
          />
        )}
      </footer>
    </div>
  );
}
