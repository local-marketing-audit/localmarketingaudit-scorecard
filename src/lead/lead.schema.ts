import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { TierKey } from '../common/types/scoring';

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ timestamps: true })
export class Lead {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  fullName: string; // encrypted

  @Prop({ required: true })
  email: string; // encrypted

  @Prop({ required: true, index: true })
  emailHash: string; // SHA-256 for dedup

  @Prop({ required: true })
  phone: string; // encrypted

  @Prop({ required: true })
  businessName: string; // encrypted

  @Prop({ required: true })
  city: string;

  @Prop({ type: String, enum: ['at_risk', 'needs_improvement', 'growth_ready', 'market_leader'] })
  scoreTier?: TierKey;

  @Prop({ type: Number, min: 0, max: 100 })
  overallScore?: number;

  @Prop()
  emailMarketingId?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true })
  consentGiven: boolean;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
