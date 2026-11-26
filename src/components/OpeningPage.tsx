import React, { useEffect, useState } from 'react';
import { BookOpenCheck, LogIn, PhoneCall, UserPlus } from 'lucide-react';
import heroLadyImg from '../assets/images/askuala_hero_green_polo_1795702880228.jpg';
import { SUPPORT_PHONE } from '../data/catalog';
import type { SiteMode, UserAccount, UserRole } from '../types/app';

interface OpeningPageProps {
  user: UserAccount | null;
  siteMode?: SiteMode;
  onStartPortal: (role: 'parent' | 'tutor') => void;
  onOpenAuth: (initialMode: 'login' | 'register', preselectedRole?: UserRole) => void;
  onResumePortal: () => void;
}

export const OpeningPage: React.FC<OpeningPageProps> = ({
  siteMode = 'hub',
  onOpenAuth,
}) => {
  const isParentOnly = siteMode === 'parent';
  const isTutorOnly = siteMode === 'tutor';
  const storageKey = isParentOnly ? 'askuala_custom_parent_hero' : 'askuala_custom_hero';

  const [imgSrc, setImgSrc] = useState<string>(heroLadyImg);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
    try {
      const custom = localStorage.getItem(storageKey);
      if (custom) setImgSrc(custom);
      else setImgSrc(heroLadyImg);
    } catch {
      setImgSrc(heroLadyImg);
    }
  }, [storageKey]);

  return (
    <div
      lang={isParentOnly ? 'am' : 'en'}
      className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 ${
        isParentOnly ? 'font-amharic' : 'font-english'
      }`}
    >
      {/* Main Architectural Hero Card */}
      <div className="bg-white rounded-2xl overflow-hidden border border-[#14532d]/20 shadow-2xl grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left: Editorial Young Ethiopian Lady Teaching Kids Portrait */}
        <div className="lg:col-span-6 relative bg-[#0f3d21] min-h-[380px] lg:min-h-[540px] overflow-hidden">
          {!imgError ? (
            <>
              <img
                src={imgSrc}
                alt="Smiling Ethiopian lady tutor wearing a green Askuala Astegniwoch polo shirt tutoring a smiling boy student"
                referrerPolicy="no-referrer"
                decoding="async"
                fetchPriority="high"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover object-center lg:absolute lg:inset-0"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-4 border border-[#eab308]/45 rounded-xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#14532d]/45 to-transparent"
              />
            </>
          ) : (
            <div className="w-full h-full min-h-[380px] flex flex-col items-center justify-center p-10 text-center bg-[#f0fdf4] text-[#14532d]">
              <BookOpenCheck className="w-12 h-12 mb-3" aria-hidden="true" />
              <p className="text-xl font-bold font-display">ኣስኳላ Tutors</p>
              <p className="text-sm mt-1 text-[#475569]">
                Ethiopian Home &amp; Online Tutoring Platform
              </p>
            </div>
          )}
        </div>

        {/* Right: Clean Bilingual Entry */}
        <div className="lg:col-span-6 p-7 sm:p-10 lg:p-12 flex flex-col justify-center bg-white">
          <p className="text-xs font-semibold tracking-wider text-[#15803d] mb-2">
            {isParentOnly
              ? 'አዲስ አበባ · በአካል እና በኦንላይን አስጠኚ'
              : 'Addis Ababa · Home & Online Tutoring'}
          </p>

          <h1
            className="font-display font-bold text-[#14532d] leading-[1.12] tracking-tight text-balance mb-3"
            style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.2rem)' }}
          >
            <span className="font-amharic">ኣስኳላ</span>{' '}
            {isParentOnly ? '— የወላጆች ፖርታል' : 'Tutors'}
          </h1>

          <p className="text-sm sm:text-base text-[#475569] leading-relaxed mb-6 max-w-lg">
            {isParentOnly
              ? 'ለልጆችዎ ብቁ እና የተረጋገጡ አስጠኚዎችን ለማግኘት አካውንት ይፍጠሩ ወይም ይግቡ።'
              : isTutorOnly
              ? 'Sign in or create a tutor account to submit your academic credentials and schedule.'
              : 'Connecting Ethiopian families with dedicated, vetted scholars — choose your portal below to begin.'}
          </p>

          {isParentOnly ? (
            <div className="space-y-3.5">
              <button
                type="button"
                onClick={() => onOpenAuth('register', 'parent')}
                className="w-full min-h-[52px] flex items-center justify-between gap-3 px-6 py-3.5 rounded-xl bg-[#14532d] text-white hover:bg-[#166534] transition-colors text-left shadow-sm cursor-pointer font-amharic"
              >
                <span className="text-base sm:text-lg font-bold whitespace-nowrap">
                  አዲስ አካውንት ፍጠር
                </span>
                <UserPlus className="w-5 h-5 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth('login', 'parent')}
                className="w-full min-h-[52px] flex items-center justify-between gap-3 px-6 py-3.5 rounded-xl border border-[#14532d]/30 bg-[#f0fdf4] text-[#14532d] hover:bg-[#dcfce7] transition-colors text-left cursor-pointer font-amharic"
              >
                <span className="text-base sm:text-lg font-bold whitespace-nowrap">
                  ግባ (Sign In)
                </span>
                <LogIn className="w-5 h-5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          ) : isTutorOnly ? (
            <div className="space-y-3.5">
              <button
                type="button"
                onClick={() => onOpenAuth('register', 'tutor')}
                className="w-full min-h-[52px] flex items-center justify-between gap-3 px-6 py-3.5 rounded-xl bg-[#14532d] text-white hover:bg-[#166534] transition-colors text-left shadow-sm cursor-pointer"
              >
                <span className="text-base sm:text-lg font-bold whitespace-nowrap">
                  Create Account
                </span>
                <UserPlus className="w-5 h-5 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth('login', 'tutor')}
                className="w-full min-h-[52px] flex items-center justify-between gap-3 px-6 py-3.5 rounded-xl border border-[#14532d]/30 bg-[#f0fdf4] text-[#14532d] hover:bg-[#dcfce7] transition-colors text-left cursor-pointer"
              >
                <span className="text-base sm:text-lg font-bold whitespace-nowrap">Sign In</span>
                <LogIn className="w-5 h-5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Portal 1: For Parents (Amharic) */}
              <section
                aria-label="For Parents"
                className="p-5 rounded-xl bg-[#f0fdf4] border border-[#14532d]/20 space-y-3 font-amharic"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-[#14532d]">
                    ለወላጆች — አስጠኚ ይፈልጉ
                  </h2>
                  <span className="text-xs font-semibold text-[#15803d] font-english whitespace-nowrap">
                    For Parents
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', 'parent')}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#14532d] text-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>አዲስ አካውንት ፍጠር</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login', 'parent')}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[#14532d]/35 bg-white text-[#14532d] text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[#dcfce7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>ግባ (Sign In)</span>
                  </button>
                </div>
              </section>

              {/* Portal 2: For Tutors (English) */}
              <section
                aria-label="For Tutors"
                className="p-5 rounded-xl bg-white border border-[#14532d]/25 space-y-3 font-english"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-[#14532d]">For Tutors</h2>
                  <span className="text-xs font-semibold text-[#475569] whitespace-nowrap">
                    Apply to Teach
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', 'tutor')}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#16a34a] text-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[#15803d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Create Account</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login', 'tutor')}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[#14532d]/35 bg-[#f8fafc] text-[#14532d] text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[#f0fdf4] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Sign In</span>
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* Support / Forgot Password Phone Callout */}
          <div className="mt-5 p-3.5 rounded-xl bg-[#f0fdf4] border border-[#22c55e] flex items-start gap-2.5 text-xs sm:text-sm text-[#14532d]">
            <PhoneCall className="w-4 h-4 text-[#15803d] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              {isParentOnly ? (
                <p className="font-amharic font-semibold">
                  የይለፍ ቃልዎን ከረሱ ወይም ተጨማሪ መረጃ ከፈለጉ እባክዎ በስልክ ቁጥር{' '}
                  <a
                    href={`tel:${SUPPORT_PHONE}`}
                    className="font-bold underline tabular-nums text-[#14532d]"
                  >
                    {SUPPORT_PHONE}
                  </a>{' '}
                  ይደውሉ።
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    Forgot your password or need further information? Contact{' '}
                    <a
                      href={`tel:${SUPPORT_PHONE}`}
                      className="font-bold underline tabular-nums text-[#14532d]"
                    >
                      {SUPPORT_PHONE}
                    </a>
                    .
                  </p>
                  <p className="font-amharic text-xs text-[#15803d] font-semibold">
                    የይለፍ ቃልዎን ከረሱ ወይም ተጨማሪ መረጃ ከፈለጉ በ {SUPPORT_PHONE} ይደውሉ።
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editorial Bilingual Quote Strip Below Hero */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <blockquote className="bg-white/95 text-[#14532d] border border-[#14532d]/15 rounded-xl px-5 py-3.5 text-sm sm:text-base font-medium shadow-sm">
          <span className="font-display italic font-semibold">
            &ldquo;Tutor with full dedication while earning and learning at once.&rdquo;
          </span>
        </blockquote>
        <blockquote
          lang="am"
          className="bg-white/95 text-[#14532d] border border-[#14532d]/15 rounded-xl px-5 py-3.5 text-sm sm:text-base font-bold shadow-sm md:text-right font-amharic"
        >
          &ldquo;ለልጆችዎ ብቁ እና የተረጋገጡ አስጠኚዎችን ያግኙ።&rdquo;
        </blockquote>
      </div>
    </div>
  );
};
