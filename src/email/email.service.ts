import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private readonly template: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.template = readFileSync(
      join(__dirname, 'templates', 'report-email.html'),
      'utf-8',
    );
  }

  /** HTML-escape a string to prevent injection in email templates */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Mask an email address for safe logging (e.g. j***@example.com) */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${local[0]}***@${domain}`;
  }

  /** Build the report email HTML by replacing template variables */
  private buildReportEmailHtml(params: {
    fullName: string;
    viewReportUrl: string;
    bookSessionUrl: string;
  }): string {
    return this.template
      .replace(/\{\{fullName\}\}/g, this.escapeHtml(params.fullName))
      .replace(/\{\{viewReportUrl\}\}/g, params.viewReportUrl)
      .replace(/\{\{bookSessionUrl\}\}/g, params.bookSessionUrl);
  }

  async sendReportEmail(params: {
    toEmail: string;
    businessName: string;
    fullName: string;
    viewReportUrl: string;
    bookSessionUrl: string;
    pdfBuffer: Buffer;
  }): Promise<boolean> {
    // Strip newlines/control chars from subject to prevent header injection
    const safeSubject = params.businessName.replace(/[\r\n\t]/g, ' ').trim();

    const html = this.buildReportEmailHtml({
      fullName: params.fullName,
      viewReportUrl: params.viewReportUrl,
      bookSessionUrl: params.bookSessionUrl,
    });

    try {
      await this.resend.emails.send({
        from: 'noreply@send.localmarketingaudit.com',
        to: params.toEmail,
        subject: `Your Local Marketing Dominance Scorecard — ${safeSubject}`,
        html,
        attachments: [
          {
            filename: 'dominance-scorecard-report.pdf',
            content: params.pdfBuffer,
          },
        ],
      });
      this.logger.log(`Report email sent to ${this.maskEmail(params.toEmail)}`);
      return true;
    } catch (err) {
      this.logger.error('Failed to send report email', err);
      return false;
    }
  }
}
