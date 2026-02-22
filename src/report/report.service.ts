import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './report.schema';
import { QuizResponse, QuizResponseDocument } from '../quiz/quiz-response.schema';
import { Lead, LeadDocument } from '../lead/lead.schema';
import { PdfService } from './pdf.service';
import { EmailService } from '../email/email.service';
import { ScoringService } from '../common/scoring/scoring.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { IdService } from '../common/id/id.service';
import type { AnswerKey } from '../common/types/quiz';
import type { TierKey } from '../common/types/scoring';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(QuizResponse.name) private quizResponseModel: Model<QuizResponseDocument>,
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    private pdfService: PdfService,
    private emailService: EmailService,
    private scoring: ScoringService,
    private encryption: EncryptionService,
    private id: IdService,
  ) {}

  async generate(sessionId: string): Promise<{ reportId: string; token: string }> {
    // Check if report already exists (dedup by sessionId)
    const existing = await this.reportModel.findOne({ sessionId });
    if (existing) {
      return { reportId: existing._id, token: this.encryption.signToken(existing._id) };
    }

    const quizResponse = await this.quizResponseModel.findById(sessionId);
    if (!quizResponse) {
      throw new NotFoundException('Quiz response not found');
    }

    const lead = await this.leadModel.findById(quizResponse.leadId);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Recalculate pillar scores from stored answers
    const result = this.scoring.calculateScore(quizResponse.answers as AnswerKey[]);

    const pdfBuffer = await this.pdfService.generatePdfBuffer({
      businessName: this.encryption.decrypt(lead.businessName),
      city: lead.city,
      totalScore: quizResponse.totalScore,
      tier: quizResponse.tier as TierKey,
      pillarScores: result.pillarScores,
    });

    const reportId = this.id.generateShortId();
    await this.reportModel.create({
      _id: reportId,
      sessionId,
      leadId: quizResponse.leadId,
      pdfData: pdfBuffer,
      fileSizeBytes: pdfBuffer.length,
      generatedAt: new Date(),
      emailStatus: 'skipped',
    });

    return { reportId, token: this.encryption.signToken(reportId) };
  }

  /** Verify a signed access token for a reportId */
  verifyAccess(reportId: string, token: string): void {
    if (!token || !this.encryption.verifyToken(reportId, token)) {
      throw new ForbiddenException('Invalid or missing access token');
    }
  }

  async download(reportId: string, token: string): Promise<{ pdfData: Buffer; fileSizeBytes: number }> {
    this.verifyAccess(reportId, token);
    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Increment download count
    await this.reportModel.findByIdAndUpdate(reportId, { $inc: { downloadCount: 1 } });

    return {
      pdfData: report.pdfData,
      fileSizeBytes: report.fileSizeBytes,
    };
  }

  async emailReport(reportId: string, token: string): Promise<{ sent: boolean }> {
    this.verifyAccess(reportId, token);

    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const lead = await this.leadModel.findById(report.leadId);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const decryptedEmail = this.encryption.decrypt(lead.email);
    const businessName = this.encryption.decrypt(lead.businessName);

    await this.reportModel.findByIdAndUpdate(reportId, { emailStatus: 'pending' });

    const sent = await this.emailService.sendReportEmail({
      toEmail: decryptedEmail,
      businessName,
      pdfBuffer: report.pdfData,
    });

    await this.reportModel.findByIdAndUpdate(reportId, {
      emailStatus: sent ? 'sent' : 'failed',
    });

    if (!sent) {
      this.logger.warn(`Email failed for report ${reportId}`);
    }

    return { sent };
  }
}
