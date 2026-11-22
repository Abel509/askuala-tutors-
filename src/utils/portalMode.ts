import type { SiteMode } from '../types/app';

export function detectSiteMode(): SiteMode {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') {
    return 'tutor';
  }

  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const queryPortal = (params.get('portal') || '').toLowerCase();

  if (
    host.startsWith('owner.') ||
    host.startsWith('admin.') ||
    path === '/owner' ||
    path.startsWith('/owner/') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    queryPortal === 'owner' ||
    queryPortal === 'admin'
  ) {
    return 'owner';
  }

  if (
    host.startsWith('parent.') ||
    host.startsWith('parents.') ||
    path === '/parent' ||
    path.startsWith('/parent/') ||
    queryPortal === 'parent'
  ) {
    return 'parent';
  }

  // Default main site is strictly the Tutor Application Website
  return 'tutor';
}

export function getSeparateWebsiteUrls(): {
  tutorUrl: string;
  parentUrl: string;
  ownerUrl: string;
} {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') {
    return {
      tutorUrl: 'https://askualatutors.com/',
      parentUrl: 'https://askualatutors.com/parent',
      ownerUrl: 'https://askualatutors.com/owner',
    };
  }
  const origin = window.location.origin;
  return {
    tutorUrl: `${origin}/`,
    parentUrl: `${origin}/parent`,
    ownerUrl: `${origin}/owner`,
  };
}
