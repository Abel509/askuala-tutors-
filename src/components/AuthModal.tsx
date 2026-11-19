import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  evaluatePasswordStrength,
  normalizeEthiopianPhone,
  suggestStrong8CharPassword,
} from '../data/catalog';
import { loginAccount, registerAccount, type AuthResponse } from '../utils/api';
import type { UserRole } from '../types/app';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'register';
  preselectedRole: UserRole;
  onClose: () => void;
  onSuccess: (auth: AuthResponse) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  preselectedRole,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<'tutor' | 'parent'>(
    preselectedRole === 'parent' ? 'parent' : 'tutor'
  );
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [suggestedPassword, setSuggestedPassword] = useState(() => suggestStrong8CharPassword());
  const [copiedSuggestion, setCopiedSuggestion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      if (preselectedRole === 'parent' || preselectedRole === 'tutor') {
        setRole(preselectedRole);
      }
      setError(null);
      setSuggestedPassword(suggestStrong8CharPassword());
    }
  }, [isOpen, initialMode, preselectedRole]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAmharicUI = role === 'parent';
  const normalizedPreview = normalizeEthiopianPhone(phone);
  const pwEval = evaluatePasswordStrength(password);

  const handleUseSuggested = () => {
    setPassword(suggestedPassword);
    setShowPassword(true);
  };

  const handleCopySuggestion = async () => {
    try {
      await navigator.clipboard.writeText(suggestedPassword);
      setCopiedSuggestion(true);
      setTimeout(() => setCopiedSuggestion(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = normalizeEthiopianPhone(phone);
    if (!normalized) {
      setError(
        isAmharicUI
          ? 'እባክዎ ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (09XXXXXXXX ወይም +2519XXXXXXXX)።'
          : 'Please enter a valid Ethiopian phone number (e.g. 0911223344 or +251911223344).'
      );
      return;
    }

    if (mode === 'register' && !pwEval.valid) {
      setError(
        isAmharicUI
          ? 'የይለፍ ቃሉ ቢያንስ 8 ፊደላት/ቁጥሮች (ትልቅ ፊደል፣ ትንሽ ፊደል፣ ቁጥር እና ምልክት) መያዝ አለበት።'
          : 'Password must be at least 8 characters and include uppercase, lowercase, a digit, and a symbol.'
      );
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === 'register'
          ? await registerAccount({ phone: normalized, password, role, fullName })
          : await loginAccount({ phone: normalized, password });
      onSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      lang={isAmharicUI ? 'am' : 'en'}
      className={`max-w-[520px] mx-auto px-4 py-8 sm:py-10 ${isAmharicUI ? 'font-amharic' : 'font-english'}`}
    >
      <div className="white-card p-6 sm:p-8">
        {/* Back button inside top-left of card (matching reference layout) */}
        <div className="mb-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border-2 border-[#22c55e] bg-white text-[#14532d] text-sm font-bold hover:bg-[#f0fdf4] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{isAmharicUI ? 'ተመለስ' : 'Back'}</span>
          </button>
        </div>

        <h1 className="text-2xl font-bold text-[#14532d]">
          {isAmharicUI
            ? mode === 'login'
              ? 'የወላጅ መግቢያ'
              : 'አዲስ የወላጅ አካውንት'
            : mode === 'login'
            ? 'Sign In'
            : 'Create Account'}
        </h1>

        <div className="instruction-box mt-3 mb-4">
          <span>✅</span>
          <span className="text-sm">
            {isAmharicUI
              ? mode === 'login'
                ? 'በተመዘገቡበት የኢትዮጵያ ስልክ ቁጥር እና የይለፍ ቃል ይግቡ፤ ወዲያውኑ ወደ ወላጅ ፖርታልዎ ይወስድዎታል።'
                : 'በኢትዮጵያ ስልክ ቁጥር እና 8 ባለ ጠንካራ የይለፍ ቃል የወላጅ አካውንት ይፍጠሩ።'
              : mode === 'login'
              ? 'Sign in with your Ethiopian phone number (+251 / 09 / 07) and password to open your portal.'
              : 'Register with your Ethiopian phone number and an 8-character strong password.'}
          </span>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2.5 px-3 rounded-lg font-bold text-sm border cursor-pointer ${
              mode === 'login'
                ? 'bg-[#14532d] text-white border-[#14532d]'
                : 'bg-white text-[#14532d] border-[#22c55e] hover:bg-[#f0fdf4]'
            }`}
          >
            {isAmharicUI ? 'ግባ (Sign In)' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2.5 px-3 rounded-lg font-bold text-sm border cursor-pointer ${
              mode === 'register'
                ? 'bg-[#14532d] text-white border-[#14532d]'
                : 'bg-white text-[#14532d] border-[#22c55e] hover:bg-[#f0fdf4]'
            }`}
          >
            {isAmharicUI ? 'አካውንት ፍጠር' : 'Create Account'}
          </button>
        </div>

        {mode === 'register' && (
          <fieldset className="mb-4">
            <legend className="text-sm font-bold text-[#14532d] mb-2">
              {isAmharicUI ? 'የአካውንት ዓይነት ይምረጡ' : 'Select Account Type'}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('parent')}
                className={`p-3 rounded-xl border-2 text-left cursor-pointer font-amharic ${
                  role === 'parent'
                    ? 'bg-[#14532d] text-white border-[#14532d]'
                    : 'bg-white text-[#14532d] border-[#22c55e] hover:bg-[#f0fdf4]'
                }`}
              >
                <div className="font-bold text-sm">ለወላጆች (ወላጅ)</div>
                <div className="text-xs opacity-90">ሙሉ በሙሉ በአማርኛ</div>
              </button>
              <button
                type="button"
                onClick={() => setRole('tutor')}
                className={`p-3 rounded-xl border-2 text-left cursor-pointer font-english ${
                  role === 'tutor'
                    ? 'bg-[#14532d] text-white border-[#14532d]'
                    : 'bg-white text-[#14532d] border-[#22c55e] hover:bg-[#f0fdf4]'
                }`}
              >
                <div className="font-bold text-sm">For Tutors</div>
                <div className="text-xs opacity-90">Grade 11+ &amp; 87%+ avg</div>
              </button>
            </div>
          </fieldset>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-fullname" className="block text-sm font-bold text-[#14532d] mb-1">
                {isAmharicUI ? 'ሙሉ ስም' : 'Full Name'}
              </label>
              <input
                id="auth-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={isAmharicUI ? 'ለምሳሌ፡ አቶ አበበ ከበደ' : 'e.g. Abebe Kebede'}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] border-[#cbd5e1] bg-white"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-phone" className="block text-sm font-bold text-[#14532d] mb-1">
              {isAmharicUI
                ? 'የኢትዮጵያ ስልክ ቁጥር (09 / 07 / +251)'
                : 'Ethiopian Phone Number (09 / 07 / +251)'}
            </label>
            <input
              id="auth-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0911223344 or +251911223344"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border-[1.5px] border-[#cbd5e1] bg-white tabular-nums"
            />
            {phone.trim().length > 0 && (
              <p className="text-xs mt-1 text-[#15803d] font-bold tabular-nums">
                {normalizedPreview
                  ? isAmharicUI
                    ? `✓ ትክክለኛ የኢትዮጵያ ስልክ ቁጥር፡ ${normalizedPreview}`
                    : `✓ Valid Ethiopian number: ${normalizedPreview}`
                  : isAmharicUI
                  ? 'በ09 ወይም 07 የሚጀምር ባለ 10 አሃዝ ስልክ ቁጥር ያስገቡ'
                  : 'Enter 10 digits starting with 09 or 07 (or +2519/+2517)'}
              </p>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="auth-password" className="block text-sm font-bold text-[#14532d]">
                {isAmharicUI ? 'የይለፍ ቃል (ቢያንስ 8 ፊደል/ቁጥር)' : 'Password (8+ Strong Characters)'}
              </label>
              {mode === 'register' && (
                <button
                  type="button"
                  onClick={handleUseSuggested}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#15803d] hover:underline cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {isAmharicUI ? 'የተጠቆመውን 8 ፊደል ይለፍ ቃል ተጠቀም' : 'Use suggested 8-char password'}
                  </span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isAmharicUI ? 'ቢያንስ 8 ጠንካራ ቁምፊዎች' : 'Minimum 8 strong characters'}
                className="w-full min-h-[44px] pl-3.5 pr-12 py-2 rounded-lg border-[1.5px] border-[#cbd5e1] bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#14532d] hover:bg-[#f0fdf4] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'register' && (
              <div className="mt-2.5 p-3 rounded-xl bg-[#f0fdf4] border border-[#22c55e] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#14532d]">
                    {isAmharicUI ? 'የተጠቆመ ባለ 8 ቁምፊ የይለፍ ቃል፡ ' : 'Suggested 8-Char Strong Password: '}
                    <code className="px-2 py-0.5 rounded bg-white border border-[#22c55e] font-mono">
                      {suggestedPassword}
                    </code>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopySuggestion}
                      className="px-2 py-1 text-xs rounded border border-[#22c55e] bg-white hover:bg-[#dcfce7] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSuggestion ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>
                        {copiedSuggestion
                          ? isAmharicUI
                            ? 'ተቀድቷል'
                            : 'Copied'
                          : isAmharicUI
                          ? 'ቅዳ'
                          : 'Copy'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestedPassword(suggestStrong8CharPassword());
                        setCopiedSuggestion(false);
                      }}
                      className="px-2 py-1 text-xs rounded border border-[#22c55e] bg-white hover:bg-[#dcfce7] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{isAmharicUI ? 'አዲስ' : 'New'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                  <span
                    className={
                      pwEval.checks.length ? 'text-[#15803d] font-bold' : 'text-[#475569]'
                    }
                  >
                    {pwEval.checks.length ? '✓' : '○'} {isAmharicUI ? '8+ ቁምፊ' : '8+ chars'}
                  </span>
                  <span
                    className={
                      pwEval.checks.upper ? 'text-[#15803d] font-bold' : 'text-[#475569]'
                    }
                  >
                    {pwEval.checks.upper ? '✓' : '○'} {isAmharicUI ? 'ትልቅ ፊደል' : 'Uppercase'}
                  </span>
                  <span
                    className={
                      pwEval.checks.lower ? 'text-[#15803d] font-bold' : 'text-[#475569]'
                    }
                  >
                    {pwEval.checks.lower ? '✓' : '○'} {isAmharicUI ? 'ትንሽ ፊደል' : 'Lowercase'}
                  </span>
                  <span
                    className={
                      pwEval.checks.digit ? 'text-[#15803d] font-bold' : 'text-[#475569]'
                    }
                  >
                    {pwEval.checks.digit ? '✓' : '○'} {isAmharicUI ? 'ቁጥር' : 'Number'}
                  </span>
                  <span
                    className={
                      pwEval.checks.symbol ? 'text-[#15803d] font-bold' : 'text-[#475569]'
                    }
                  >
                    {pwEval.checks.symbol ? '✓' : '○'} {isAmharicUI ? 'ምልክት' : 'Symbol'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#fef2f2] border-2 border-[#fca5a5] text-[#dc2626] text-sm font-bold flex items-start gap-2"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] px-5 py-3 rounded-xl bg-[#16a34a] text-white font-bold text-base hover:bg-[#15803d] disabled:opacity-60 cursor-pointer"
          >
            {loading
              ? isAmharicUI
                ? 'እባክዎ ይጠብቁ...'
                : 'Please wait...'
              : mode === 'register'
              ? isAmharicUI
                ? 'አካውንት ፍጠር እና ቀጥል →'
                : 'Create Account & Continue →'
              : isAmharicUI
              ? 'ግባ →'
              : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
};
