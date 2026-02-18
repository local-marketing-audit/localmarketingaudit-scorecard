import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuizService } from './quiz.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@Controller('quiz')
export class QuizController {
  constructor(private quizService: QuizService) {}

  @Post('submit')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async submit(@Body() dto: SubmitQuizDto) {
    return this.quizService.submit(dto);
  }
}
