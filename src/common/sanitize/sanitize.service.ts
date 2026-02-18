import { Injectable } from '@nestjs/common';

@Injectable()
export class SanitizeService {
  /** Strip HTML tags and trim whitespace from user input */
  sanitize(input: string): string {
    return input.replace(/<[^>]*>/g, '').trim();
  }
}
