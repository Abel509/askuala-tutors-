import type { SiteMode } from '../types/app';

export function detectSiteMode(): SiteMode {
  return 'tutor';
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
    tutorUrl: `${origin}/`,
    parentUrl: `${origin}/`,
    ownerUrl: `${origin}/`,
  };
}
