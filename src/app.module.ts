import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { LeadModule } from './lead/lead.module';
import { QuizModule } from './quiz/quiz.module';
import { ReportModule } from './report/report.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Environment config
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB connection
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    // Rate limiting (60 requests per minute per IP)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    // Feature modules
    CommonModule,
    LeadModule,
    QuizModule,
    ReportModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
