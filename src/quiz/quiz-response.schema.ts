import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { AnswerKey } from '../common/types/quiz';
import type { TierKey } from '../common/types/scoring';

export type QuizResponseDocument = HydratedDocument<QuizResponse>;

@Schema({ timestamps: true })
export class QuizResponse {
  @Prop({ type: String, required: true })
  _id: string; // nanoid = sessionId

  @Prop({ required: true, index: true })
  leadId: string;

  @Prop({
    type: [{ type: String, enum: ['a', 'b', 'c'] }],
    required: true,
    validate: {
      validator: (v: string[]) => v.length === 10,
      message: 'Must have exactly 10 answers',
    },
  })
  answers: AnswerKey[];

  @Prop({ required: true, min: 0, max: 100 })
  totalScore: number;

  @Prop({
    type: String,
    required: true,
    enum: ['at_risk', 'needs_improvement', 'growth_ready', 'market_leader'],
  })
  tier: TierKey;

  @Prop({ required: true })
  quizVersion: string;

  @Prop({ required: true })
  completedAt: Date;
}

export const QuizResponseSchema = SchemaFactory.createForClass(QuizResponse);
