import React, { useEffect, useState } from 'react';
import { BookOpenCheck, LogIn, UserPlus, Users } from 'lucide-react';
import heroTutorImg from '../assets/images/ethiopian_tutor_boy_1795096505461.jpg';
import type { SiteMode, UserAccount, UserRole } from '../types/app';

interface OpeningPageProps {
  user: UserAccount | null;
  siteMode?: SiteMode;
  onStartPortal: (role: 'parent' | 'tutor') => void;
  onOpenAuth: (initialMode: 'login' | 'register', preselectedRole?: UserRole) => void;
  onResumePortal: () => void;
}

export const OpeningPage: React.FC<OpeningPageProps> = ({
  user,
  siteMode = 'tutor',
  onStartPortal,
  onOpenAuth,
  onResumePortal,
}) => {
  const [imgSrc, setImgSrc] = useState<string>(heroTutorImg);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    try {
      const custom = localStorage.getItem('askuala_custom_hero');
      if (custom) setImgSrc(custom);
      else setImgSrc(heroTutorImg);
    } catch {
      setImgSrc(heroTutorImg);
    }
  }, []);

  const isParentOnly = siteMode === 'parent';

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
        {/* Left: Ethiopian Tutor Picture */}
        <div className="md:col-span-6 relative bg-[#f8fafc] min-h-[340px] md:min-h-[430px] border-b-2 md:border-b-0 md:border-r-2 border-[#dcfce7]">
          {!imgError ? (
            <img
              src={imgSrc}
              alt="An Ethiopian tutor teaching a student at home"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center md:absolute md:inset-0"
            />
          ) : (
            <div className="w-full h-full min-h-[340px] flex flex-col items-center justify-center p-8 text-center bg-[#f0fdf4] text-[#14532d]">
              <BookOpenCheck className="w-12 h-12 mb-3" aria-hidden="true" />
              <p className="text-lg font-bold">ኣስኳላ Tutors</p>
              <p className="text-sm mt-1">Ethiopian Tutor Application Portal</p>
            </div>
          )}
        </div>

        {/* Right: Ultra-clean Sign In & Create Account buttons only */}
        <div className="md:col-span-6 p-7 sm:p-10 flex flex-col justify-center bg-white">
          <h1
            className="font-extrabold text-[#14532d] leading-tight mb-6"
            style={{ fontSize: 'clamp(2.1rem, 3.8vw, 2.8rem)' }}
          >
            <span className="font-amharic">ኣስኳላ</span>{' '}
            {isParentOnly ? '— የወላጆች ፖርታል' : 'Tutors'}
          </h1>

          {isParentOnly ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => onStartPortal('parent')}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border-2 border-[#14532d] bg-[#14532d] text-white hover:bg-[#166534] transition-all text-left shadow-sm cursor-pointer font-amharic"
              >
                <div>
                  <span className="text-lg sm:text-xl font-bold block">የወላጅ ማመልከቻ ጀምር</span>
                  <span className="text-sm opacity-95 block mt-0.5">
                    ለልጆችዎ ብቁ አስጠኚዎችን ለማግኘት ይመዝገቡ
                  </span>
                </div>
                <Users className="w-6 h-6 shrink-0" aria-hidden="true" />
              </button>

              <div className="mt-6 pt-4 border-t border-[#dcfce7] flex flex-wrap items-center justify-between gap-3 text-sm">
                {user ? (
                  <>
                    <span className="text-[#0f172a] font-semibold">
                      ገብተዋል፡ <strong className="text-[#14532d]">{user.phone}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={onResumePortal}
                      className="font-bold text-[#15803d] underline underline-offset-4 hover:text-[#14532d] cursor-pointer"
                    >
                      የወላጅ ማመልከቻ ክፈት →
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenAuth('login', 'parent')}
                      className="font-bold text-[#14532d] underline underline-offset-4 hover:text-[#15803d] cursor-pointer"
                    >
                      አካውንት አለዎት? ይግቡ
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAuth('register', 'parent')}
                      className="font-bold text-[#15803d] underline underline-offset-4 hover:text-[#14532d] cursor-pointer"
                    >
                      አዲስ አካውንት ይፍጠሩ
                    </button>
                  </>
                )}
              </div>
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
