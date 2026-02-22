import { Controller, Post, Get, Body, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ReportService } from './report.service';
import { GenerateReportDto } from './dto/generate-report.dto';

@Controller('report')
export class ReportController {
  constructor(private reportService: ReportService) {}

  @Post('generate')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async generate(@Body() dto: GenerateReportDto) {
    return this.reportService.generate(dto.sessionId);
  }

  @Get('download/:reportId')
  async download(
    @Param('reportId') reportId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const { pdfData, fileSizeBytes } = await this.reportService.download(reportId, token);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="dominance-scorecard-report.pdf"',
      'Content-Length': String(fileSizeBytes),
    });

    res.send(pdfData);
  }

  @Post('email/:reportId')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async email(@Param('reportId') reportId: string, @Body('token') token: string) {
    return this.reportService.emailReport(reportId, token);
  }
}
