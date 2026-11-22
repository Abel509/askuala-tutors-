import type { SiteMode } from '../types/app';

export function detectSiteMode(): SiteMode {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') {
    return 'hub';
  }

  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const queryPortal = (params.get('portal') || '').toLowerCase();

  if (
    host.startsWith('tutor.') ||
    host.startsWith('tutors.') ||
    path === '/tutor' ||
    path.startsWith('/tutor/') ||
    queryPortal === 'tutor'
  ) {
    return 'tutor';
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

  return 'hub';
}

export function getSeparateWebsiteUrls(): {
  tutorUrl: string;
  parentUrl: string;
  ownerUrl: string;
} {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') {
    return {
      tutorUrl: 'https://askualatutors.com/tutor',
      parentUrl: 'https://askualatutors.com/parent',
      ownerUrl: 'https://askualatutors.com/owner',
    };
  }
  const origin = window.location.origin;
  return {
    tutorUrl: `${origin}/tutor`,
    parentUrl: `${origin}/parent`,
    ownerUrl: `${origin}/owner`,
  };
}
