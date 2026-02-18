import { IsString, MinLength } from 'class-validator';

export class GenerateReportDto {
  @IsString()
  @MinLength(1)
  sessionId: string;
}
