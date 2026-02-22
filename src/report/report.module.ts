import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './report.schema';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { PdfService } from './pdf.service';
import { EmailModule } from '../email/email.module';
import { QuizModule } from '../quiz/quiz.module';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    EmailModule,
    QuizModule,
    LeadModule,
  ],
  controllers: [ReportController],
  providers: [ReportService, PdfService],
})
export class ReportModule {}
