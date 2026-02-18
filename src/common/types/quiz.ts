export type AnswerKey = 'a' | 'b' | 'c';

export interface AnswerOption {
  key: AnswerKey;
  label: string;
  tag: string;
  icon: string;
  points: number;
}

export interface Question {
  id: number;
  text: string;
  hint?: string;
  options: [AnswerOption, AnswerOption, AnswerOption];
}
