import type { TierData, TierKey } from '../types/scoring';

export const tiers: Record<TierKey, TierData> = {
  at_risk: {
    key: 'at_risk',
    name: 'At Risk',
    color: '#EF4444',
    scoreMin: 0,
    scoreMax: 30,
    summary:
      'Your online presence is costing you leads. Local customers are likely choosing competitors before they ever contact you.',
    descriptionBlock:
      'Your local marketing is significantly under-performing. Key areas like search visibility, website conversion, and online reputation are well below the threshold needed to compete effectively in your market. Most potential customers are finding your competitors first, and those who do land on your website may be leaving due to friction or lack of trust signals. The good news: targeted improvements to your weakest areas can produce rapid, measurable gains. Focus on fixing the fundamentals before expanding into new channels.',
    bullets: [
      'Low visibility',
      'Weak trust signals',
      'Friction in contacting you',
      'No reliable lead tracking',
    ],
    primaryCTA: {
      label: 'Get the Starter Audit ($99)',
      subtext: 'Uncover the biggest leaks holding your business back.',
      href: '/audit',
    },
  },
  needs_improvement: {
    key: 'needs_improvement',
    name: 'Needs Improvement',
    color: '#F59E0B',
    scoreMin: 31,
    scoreMax: 55,
    summary:
      'You have a foundation, but missed opportunities are limiting consistent growth.',
    descriptionBlock:
      'You have some of the building blocks in place, but gaps in your marketing are preventing consistent lead flow. Your business may appear in local searches sometimes but not reliably. Your website communicates your services but may lack the clarity or trust elements that convert browsers into buyers. Inconsistent marketing activity means your pipeline fluctuates. By tightening up your weakest pillar, you can move from sporadic results to a more predictable growth trajectory.',
    bullets: [
      'Partial optimization',
      'Inconsistent marketing',
      'Moderate trust & conversion',
    ],
    primaryCTA: {
      label: 'Get the Starter Audit',
      href: '/audit',
    },
    secondaryCTA: {
      label: 'View the Growth Blueprint',
      href: '/blueprint',
    },
  },
  growth_ready: {
    key: 'growth_ready',
    name: 'Growth Ready',
    color: '#3B82F6',
    scoreMin: 56,
    scoreMax: 75,
    summary:
      "Your marketing is working — but it's not optimized. Small improvements could unlock significantly more leads.",
    descriptionBlock:
      "Your local marketing foundation is solid. You're showing up in search, your website works reasonably well, and you have some trust signals in place. However, there are specific areas where optimization could unlock significantly more leads without requiring a major overhaul. You're likely leaving money on the table in one or two key areas. Addressing your lowest-scoring pillar will have an outsized impact on your overall performance and help you pull ahead of local competitors.",
    bullets: [
      'Underused channels',
      'Conversion gaps',
      'Weak follow-up systems',
    ],
    primaryCTA: {
      label: 'Build My Growth Blueprint',
      subtext: 'Turn momentum into predictable growth.',
      href: '/blueprint',
    },
  },
  market_leader: {
    key: 'market_leader',
    name: 'Market Leader',
    color: '#22C55E',
    scoreMin: 76,
    scoreMax: 100,
    summary:
      "You're ahead of most local competitors. The next step is scaling and protecting your position.",
    descriptionBlock:
      "You're operating at a high level across most local marketing pillars. Your visibility is strong, your conversion paths are working, and you've built meaningful trust with your audience. At this stage, the opportunity isn't about fixing what's broken — it's about scaling what works and defending your market position. Even small refinements to your remaining weak spots can compound into significant competitive advantages. Consider advanced strategies like marketing automation, referral systems, and multi-channel campaigns to stay ahead.",
    bullets: [
      'Strong visibility',
      'High trust',
      'Solid conversion paths',
    ],
    primaryCTA: {
      label: 'Book a Strategy Call',
      subtext: "Let's scale what's already working.",
      href: '/strategy',
    },
  },
};

export const tierOrder: TierKey[] = ['at_risk', 'needs_improvement', 'growth_ready', 'market_leader'];
