import React, { useEffect, useState } from 'react';
import { BookOpenCheck, LogIn, UserPlus } from 'lucide-react';
import heroTutorImg from '../assets/images/ethiopian_tutor_boy_1795096505461.jpg';
import heroParentImg from '../assets/images/ethiopian_female_tutor_kids_1795379813454.jpg';
import type { SiteMode, UserAccount, UserRole } from '../types/app';

interface OpeningPageProps {
  user: UserAccount | null;
  siteMode?: SiteMode;
  onStartPortal: (role: 'parent' | 'tutor') => void;
  onOpenAuth: (initialMode: 'login' | 'register', preselectedRole?: UserRole) => void;
  onResumePortal: () => void;
}

export const OpeningPage: React.FC<OpeningPageProps> = ({
  siteMode = 'parent',
  onOpenAuth,
}) => {
  const isParentOnly = siteMode === 'parent';
  const defaultHero = isParentOnly ? heroParentImg : heroTutorImg;
  const storageKey = isParentOnly ? 'askuala_custom_parent_hero' : 'askuala_custom_hero';

  const [imgSrc, setImgSrc] = useState<string>(defaultHero);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
    try {
      const custom = localStorage.getItem(storageKey);
      if (custom) setImgSrc(custom);
      else setImgSrc(defaultHero);
    } catch {
      setImgSrc(defaultHero);
    }
  }, [defaultHero, storageKey]);

  return (
    <div
      lang={isParentOnly ? 'am' : 'en'}
      className={`max-w-5xl mx-auto px-4 sm:px-6 py-7 ${
        isParentOnly ? 'font-amharic' : 'font-english'
      }`}
    >
      {/* Upper-Left Quote */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {isParentOnly ? (
          <blockquote
            lang="am"
            className="bg-white text-[#14532d] border-2 border-[#22c55e] border-l-[7px] border-l-[#16a34a] rounded-xl px-4 py-2.5 text-base sm:text-lg font-bold shadow font-amharic"
          >
            &ldquo;ለልጆችዎ ብቁ እና የተረጋገጡ አስጠኚዎችን ያግኙ&rdquo;
          </blockquote>
        ) : (
          <blockquote className="bg-white text-[#14532d] border-2 border-[#22c55e] border-l-[7px] border-l-[#16a34a] rounded-xl px-4 py-2.5 text-base sm:text-lg italic font-bold shadow">
            &ldquo;Tutor with full dedication while earning and learning at once&rdquo;
          </blockquote>
        )}
      </div>

      {/* Main Hero Card */}
      <div className="bg-white rounded-[18px] overflow-hidden border-[3px] border-[#14532d] shadow-2xl grid grid-cols-1 md:grid-cols-12">
        {/* Left: Dedicated Ethiopian Young Female Tutor & Kids Photo (Parent Portal) or Tutor Photo */}
        <div className="md:col-span-6 relative bg-[#f8fafc] min-h-[340px] md:min-h-[430px] border-b-2 md:border-b-0 md:border-r-2 border-[#dcfce7]">
          {!imgError ? (
            <img
              src={imgSrc}
              alt={
                isParentOnly
                  ? 'ወጣት ኢትዮጵያዊት አስጠኚ ሁለት ልጆችን ቤት ውስጥ ስታስጠና'
                  : 'An Ethiopian tutor teaching a student at home'
              }
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center md:absolute md:inset-0"
            />
          ) : (
            <div className="w-full h-full min-h-[340px] flex flex-col items-center justify-center p-8 text-center bg-[#f0fdf4] text-[#14532d]">
              <BookOpenCheck className="w-12 h-12 mb-3" aria-hidden="true" />
              <p className="text-lg font-bold">
                {isParentOnly ? 'ኣስኳላ — የወላጆች ፖርታል' : 'ኣስኳላ Tutors'}
              </p>
              <p className="text-sm mt-1">
                {isParentOnly ? 'የቤተሰብ እና የልጆች አስጠኚ መመዝገቢያ' : 'Ethiopian Tutor Application Portal'}
              </p>
            </div>
          )}
        </div>

        {/* Right: Clean Create Account & Sign In buttons only */}
        <div className="md:col-span-6 p-7 sm:p-10 flex flex-col justify-center bg-white">
          <h1
            className="font-extrabold text-[#14532d] leading-tight mb-6"
            style={{ fontSize: 'clamp(2.0rem, 3.6vw, 2.65rem)' }}
          >
            <span className="font-amharic">ኣስኳላ</span>{' '}
            {isParentOnly ? '— የወላጆች ፖርታል' : 'Tutors'}
          </h1>

          {isParentOnly ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => onOpenAuth('register', 'parent')}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 rounded-xl border-2 border-[#14532d] bg-[#14532d] text-white hover:bg-[#166534] transition-all text-left shadow-sm cursor-pointer font-amharic"
              >
                <span className="text-lg sm:text-xl font-bold">አዲስ አካውንት ፍጠር</span>
                <UserPlus className="w-6 h-6 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth('login', 'parent')}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 rounded-xl border-2 border-[#22c55e] bg-white text-[#14532d] hover:bg-[#f0fdf4] transition-all text-left shadow-sm cursor-pointer font-amharic"
              >
                <span className="text-lg sm:text-xl font-bold">ግባ (Sign In)</span>
                <LogIn className="w-6 h-6 shrink-0" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => onOpenAuth('register', 'tutor')}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 rounded-xl border-2 border-[#14532d] bg-[#14532d] text-white hover:bg-[#166534] transition-all text-left shadow-sm cursor-pointer"
              >
                <span className="text-lg sm:text-xl font-bold">Create Account</span>
                <UserPlus className="w-6 h-6 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth('login', 'tutor')}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 rounded-xl border-2 border-[#22c55e] bg-white text-[#14532d] hover:bg-[#f0fdf4] transition-all text-left shadow-sm cursor-pointer"
              >
                <span className="text-lg sm:text-xl font-bold">Sign In</span>
                <LogIn className="w-6 h-6 shrink-0" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lower-Right Quote */}
      <div className="mt-4 flex justify-end">
        {isParentOnly ? (
          <blockquote
            lang="am"
            className="bg-white text-[#14532d] border-2 border-[#22c55e] border-r-[7px] border-r-[#16a34a] rounded-xl px-4 py-2.5 text-base sm:text-lg font-bold shadow text-right font-amharic"
          >
            &ldquo;ለልጆችዎ የወደፊት ስኬት አስተማማኝ እና የተረጋገጠ የጥናት ጓደኛ&rdquo;
          </blockquote>
        ) : (
          <blockquote
            lang="am"
            className="bg-white text-[#14532d] border-2 border-[#22c55e] border-r-[7px] border-r-[#16a34a] rounded-xl px-4 py-2.5 text-base sm:text-lg font-bold shadow text-right font-amharic"
          >
            &ldquo;በትጋት ያስተምሩ &middot; እየተማሩና እያገለገሉ ገቢዎን ያሳድጉ&rdquo;
          </blockquote>
        )}
      </div>
    </div>
  );
};
