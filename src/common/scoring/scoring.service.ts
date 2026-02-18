import { Injectable } from '@nestjs/common';
import type { AnswerKey } from '../types/quiz';
import type { PillarScores, ScoringResult, TierKey } from '../types/scoring';
import { tiers } from '../config/tiers';
import { questions } from '../config/quiz-questions';

const POINTS: Record<AnswerKey, number> = { a: 0, b: 5, c: 10 };

@Injectable()
export class ScoringService {
  calculateScore(answers: AnswerKey[]): ScoringResult {
    if (answers.length !== questions.length) {
      throw new Error(`Expected ${questions.length} answers, got ${answers.length}`);
    }

    const totalScore = answers.reduce((sum, key) => sum + POINTS[key], 0);
    const tier = this.getTier(totalScore);
    const pillarScores = this.calculatePillarScores(answers);

    return {
      totalScore,
      tier,
      tierData: tiers[tier],
      pillarScores,
      answers,
    };
  }

  private calculatePillarScores(answers: AnswerKey[]): PillarScores {
    const p = (index: number) => POINTS[answers[index]];

    return {
      visibility: p(0) + p(1),  // Q1 (local search) + Q2 (GBP)
      conversion: p(2) + p(3),  // Q3 (website clarity) + Q4 (contact ease)
      reputation: p(4) + p(8),  // Q5 (reviews) + Q9 (credibility)
      marketing: p(5) + p(9),   // Q6 (marketing frequency) + Q10 (branding)
      tracking: p(6) + p(7),    // Q7 (lead tracking) + Q8 (mobile)
    };
  }

  private getTier(score: number): TierKey {
    if (score <= 30) return 'at_risk';
    if (score <= 55) return 'needs_improvement';
    if (score <= 75) return 'growth_ready';
    return 'market_leader';
  }
}
