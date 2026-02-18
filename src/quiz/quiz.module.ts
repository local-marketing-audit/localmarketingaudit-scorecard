import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizResponse, QuizResponseSchema } from './quiz-response.schema';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: QuizResponse.name, schema: QuizResponseSchema }]),
    LeadModule,
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [MongooseModule],
})
export class QuizModule {}
