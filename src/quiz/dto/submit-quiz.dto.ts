import { IsString, IsArray, IsIn, ArrayMinSize, ArrayMaxSize, MinLength } from 'class-validator';

export class SubmitQuizDto {
  @IsString()
  @MinLength(1)
  leadId: string;

  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @IsIn(['a', 'b', 'c'], { each: true })
  answers: ('a' | 'b' | 'c')[];
}
