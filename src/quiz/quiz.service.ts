import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuizResponse, QuizResponseDocument } from './quiz-response.schema';
import { Lead, LeadDocument } from '../lead/lead.schema';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { ScoringService } from '../common/scoring/scoring.service';
import { IdService } from '../common/id/id.service';
import { QUIZ_VERSION } from '../common/config/quiz-questions';
import type { AnswerKey } from '../common/types/quiz';

@Injectable()
export class QuizService {
  constructor(
    @InjectModel(QuizResponse.name) private quizResponseModel: Model<QuizResponseDocument>,
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    private scoring: ScoringService,
    private id: IdService,
  ) {}

  async submit(dto: SubmitQuizDto) {
    const answers = dto.answers as AnswerKey[];
    const result = this.scoring.calculateScore(answers);
    const sessionId = this.id.generateId();

    // Persist quiz response
    await this.quizResponseModel.create({
      _id: sessionId,
      leadId: dto.leadId,
      answers,
      totalScore: result.totalScore,
      tier: result.tier,
      quizVersion: QUIZ_VERSION,
      completedAt: new Date(),
    });

    // Update lead with score
    await this.leadModel.findByIdAndUpdate(dto.leadId, {
      scoreTier: result.tier,
      overallScore: result.totalScore,
      $addToSet: { tags: `tier:${result.tier}` },
    });

    return {
      sessionId,
      totalScore: result.totalScore,
      tier: result.tier,
    };
  }
}
