import type { AnswerKey } from './quiz';

export type TierKey = 'at_risk' | 'needs_improvement' | 'growth_ready' | 'market_leader';

export interface TierCTA {
  label: string;
  subtext?: string;
  href: string;
}

export type PillarKey = 'visibility' | 'conversion' | 'reputation' | 'marketing' | 'tracking';

export interface PillarScores {
  visibility: number;
  conversion: number;
  reputation: number;
  marketing: number;
  tracking: number;
}

export interface TierData {
  key: TierKey;
  name: string;
  color: string;
  scoreMin: number;
  scoreMax: number;
  summary: string;
  descriptionBlock: string;
  bullets: string[];
  primaryCTA: TierCTA;
  secondaryCTA?: TierCTA;
}

export interface ScoringResult {
  totalScore: number;
  tier: TierKey;
  tierData: TierData;
  pillarScores: PillarScores;
  answers: AnswerKey[];
}
