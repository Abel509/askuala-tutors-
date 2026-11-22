import type { SiteMode } from '../types/app';

export function detectSiteMode(): SiteMode {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const qSite = (params.get('site') || params.get('portal') || '').toLowerCase();
    if (qSite === 'tutor' || qSite === 'tutors') return 'tutor';
    if (qSite === 'parent' || qSite === 'parents') return 'parent';
    if (qSite === 'owner' || qSite === 'admin') return 'owner';
    if (qSite === 'hub' || qSite === 'all' || qSite === 'both') return 'hub';

    const path = window.location.pathname.toLowerCase();
    if (path === '/tutor' || path.startsWith('/tutor/')) return 'tutor';
    if (path === '/parent' || path.startsWith('/parent/')) return 'parent';
    if (
      path === '/owner' ||
      path.startsWith('/owner/') ||
      path === '/admin' ||
      path.startsWith('/admin/')
    ) {
      return 'owner';
    }
  }

  const envMode = String(import.meta.env.VITE_SITE_MODE || '').toLowerCase();
  if (envMode === 'tutor') return 'tutor';
  if (envMode === 'parent') return 'parent';
  if (envMode === 'owner' || envMode === 'admin') return 'owner';

  return 'hub';
}

export function getSeparateWebsiteUrls(): {
  tutorUrl: string;
  parentUrl: string;
  ownerUrl: string;
} {
  const origin =
    typeof window !== 'undefined' && window.location.protocol !== 'file:'
      ? window.location.origin
      : 'https://askualatutors.com';
  return {
    tutorUrl: `${origin}/tutor`,
    parentUrl: `${origin}/parent`,
    ownerUrl: `${origin}/owner`,
  };
}
