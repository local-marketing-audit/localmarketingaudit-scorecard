import type { PillarKey } from '../types/scoring';

export interface PillarConfig {
  key: PillarKey;
  name: string;
  impactStatement: string;
}

export const pillars: Record<PillarKey, PillarConfig> = {
  visibility: {
    key: 'visibility',
    name: 'Local Visibility',
    impactStatement:
      "Customers can't choose you if they can't find you. Low visibility in local search and maps means you're losing leads to competitors who show up first. Improving your local search presence is the fastest way to drive new inquiries.",
  },
  conversion: {
    key: 'conversion',
    name: 'Conversion & Contact',
    impactStatement:
      "Your website may be getting traffic, but if visitors can't quickly understand what you offer or how to reach you, they leave. Reducing friction in your contact and booking process can dramatically increase the number of leads you capture.",
  },
  reputation: {
    key: 'reputation',
    name: 'Reputation & Trust',
    impactStatement:
      'Modern customers check reviews and credibility signals before making a decision. Without strong social proof, potential leads hesitate or choose a competitor with better-established trust. Building your reputation creates a compounding advantage.',
  },
  marketing: {
    key: 'marketing',
    name: 'Marketing Consistency',
    impactStatement:
      'Sporadic marketing produces sporadic results. When your messaging and outreach are inconsistent, you lose momentum and brand recognition. A steady, intentional marketing cadence keeps your pipeline full and your brand top-of-mind.',
  },
  tracking: {
    key: 'tracking',
    name: 'Tracking & Performance',
    impactStatement:
      "If you can't measure it, you can't improve it. Without proper tracking, you're spending time and money on marketing with no way to know what's working. Setting up lead tracking gives you the data to make smarter decisions and maximize ROI.",
  },
};
