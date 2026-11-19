import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpenCheck, Users } from 'lucide-react';
import heroTutorImg from '../assets/images/ethiopian_tutor_scene_1795070766343.jpg';
import type { UserAccount, UserRole } from '../types/app';

interface OpeningPageProps {
  user: UserAccount | null;
  onStartPortal: (role: 'parent' | 'tutor') => void;
  onOpenAuth: (initialMode: 'login' | 'register', preselectedRole?: UserRole) => void;
  onResumePortal: () => void;
}

export const OpeningPage: React.FC<OpeningPageProps> = ({
  user,
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 font-english">
      {/* Upper-Left Quote in Amharic */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <blockquote
          lang="am"
          className="bg-white text-[#14532d] border-2 border-[#22c55e] border-l-[7px] border-l-[#16a34a] rounded-xl px-4 py-2.5 text-base sm:text-lg font-bold shadow font-amharic"
        >
          &ldquo;ለልጆችዎ ብቁ እና የተረጋገጡ አስጠኚዎችን ያግኙ&rdquo;
        </blockquote>
      </div>

      {/* Main Hero Card (Photo Left, Title & 2 Portal Buttons Right) */}
      <div className="bg-white rounded-[18px] overflow-hidden border-[3px] border-[#14532d] shadow-2xl grid grid-cols-1 md:grid-cols-12">
        {/* Left: Ethiopian Tutor + Child + Smiling Father Picture */}
        <div className="md:col-span-6 relative bg-[#f8fafc] min-h-[340px] md:min-h-[430px] border-b-2 md:border-b-0 md:border-r-2 border-[#dcfce7]">
          {!imgError ? (
            <img
              src={imgSrc}
              alt="An Ethiopian tutor aged 17+ sitting and teaching a child while the child's smiling Ethiopian father opens the door looking at them"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center md:absolute md:inset-0"
            />
          ) : (
            <div className="w-full h-full min-h-[340px] flex flex-col items-center justify-center p-8 text-center bg-[#f0fdf4] text-[#14532d]">
              <BookOpenCheck className="w-12 h-12 mb-3" aria-hidden="true" />
              <p className="text-lg font-bold">ኣስኳላ Tutors</p>
              <p className="text-sm mt-1">Verified Ethiopian Tutors &amp; Family Matching</p>
            </div>
          )}
        </div>

        {/* Right: Name, Amharic Parent Button, Tutor Button, Sign In / Create Account */}
        <div className="md:col-span-6 p-7 sm:p-10 flex flex-col justify-center bg-white">
          <h1
            className="font-extrabold text-[#14532d] leading-tight mb-6"
            style={{ fontSize: 'clamp(2.1rem, 3.8vw, 2.8rem)' }}
          >
            <span className="font-amharic">ኣስኳላ</span> Tutors
          </h1>

          <div className="space-y-4">
            {/* Parents Button in Amharic */}
            <button
              type="button"
              onClick={() => onStartPortal('parent')}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border-2 border-[#14532d] bg-[#14532d] text-white hover:bg-[#166534] transition-all text-left shadow-sm cursor-pointer font-amharic"
            >
              <div>
                <span className="text-lg sm:text-xl font-bold block">ለወላጆች (ወላጅ)</span>
                <span className="text-sm opacity-95 block mt-0.5">
                  ለልጆችዎ ብቁ አስጠኚዎችን ያግኙ &middot; በአማርኛ ይመዝገቡ
                </span>
              </div>
              <Users className="w-6 h-6 shrink-0" aria-hidden="true" />
            </button>

            {/* Tutors Button */}
            <button
              type="button"
              onClick={() => onStartPortal('tutor')}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border-2 border-[#22c55e] bg-white text-[#14532d] hover:bg-[#f0fdf4] transition-all text-left shadow-sm cursor-pointer"
            >
              <div>
                <span className="text-lg sm:text-xl font-bold block">For Tutors</span>
                <span className="text-sm text-[#15803d] font-semibold block mt-0.5">
                  Apply as a verified tutor (Grade 11+ &amp; 87%+ avg)
                </span>
              </div>
              <ArrowRight className="w-6 h-6 shrink-0" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-[#dcfce7] flex flex-wrap items-center justify-between gap-3 text-sm">
            {user ? (
              <>
                <span className="text-[#0f172a] font-semibold">
                  Signed in: <strong className="text-[#14532d]">{user.phone}</strong>
                </span>
                <button
                  type="button"
                  onClick={onResumePortal}
                  className="font-bold text-[#15803d] underline underline-offset-4 hover:text-[#14532d] cursor-pointer"
                >
                  {user.role === 'parent'
                    ? 'የወላጅ ማመልከቻ ክፈት →'
                    : user.role === 'admin'
                    ? 'Open Owner Console →'
                    : 'Open Tutor Application →'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login', 'tutor')}
                  className="font-bold text-[#14532d] underline underline-offset-4 hover:text-[#15803d] cursor-pointer"
                >
                  Already have an account? Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register', 'tutor')}
                  className="font-bold text-[#15803d] underline underline-offset-4 hover:text-[#14532d] cursor-pointer"
                >
                  Create Account
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lower-Right Quote in English */}
      <div className="mt-4 flex justify-end">
        <blockquote className="bg-white text-[#14532d] border-2 border-[#22c55e] border-r-[7px] border-r-[#16a34a] rounded-xl px-4 py-2.5 text-base sm:text-lg italic font-bold shadow text-right">
          &ldquo;Tutor with full dedication while earning and learning at once&rdquo;
        </blockquote>
      </div>
    </div>
  );
};
