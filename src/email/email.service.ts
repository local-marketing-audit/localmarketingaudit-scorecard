import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
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

  async sendReportEmail(params: {
    toEmail: string;
    businessName: string;
    pdfBuffer: Buffer;
  }): Promise<boolean> {
    const safeName = this.escapeHtml(params.businessName);
    // Strip newlines/control chars from subject to prevent header injection
    const safeSubject = params.businessName.replace(/[\r\n\t]/g, ' ').trim();

    try {
      await this.resend.emails.send({
        from: 'noreply@send.localmarketingaudit.com',
        to: params.toEmail,
        subject: `Your Local Marketing Dominance Scorecard — ${safeSubject}`,
        html: `
          <p>Hi there,</p>
          <p>Your personalized <strong>Local Marketing Dominance Scorecard</strong> for <strong>${safeName}</strong> is attached to this email.</p>
          <p>Review it to see where you stand across the 5 key pillars of local marketing and what to prioritize first.</p>
          <p>Questions? Reply to this email and we'll get back to you.</p>
          <p>— The Local Marketing Audit Team</p>
        `,
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
