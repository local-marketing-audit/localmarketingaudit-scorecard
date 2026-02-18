import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: String, required: true })
  _id: string; // nanoid(12)

  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true })
  leadId: string;

  @Prop({ type: Buffer, required: true })
  pdfData: Buffer;

  @Prop({ required: true })
  fileSizeBytes: number;

  @Prop({ required: true })
  generatedAt: Date;

  @Prop({
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending',
  })
  emailStatus: 'pending' | 'sent' | 'failed' | 'skipped';

  @Prop({ type: Number, default: 0 })
  downloadCount: number;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
