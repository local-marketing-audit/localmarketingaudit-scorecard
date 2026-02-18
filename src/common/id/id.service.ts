import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

function nanoid(size = 21): string {
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) {
    id += URL_ALPHABET[bytes[i] & 63];
  }
  return id;
}

@Injectable()
export class IdService {
  /** Generate a URL-safe session/document ID (21 chars) */
  generateId(): string {
    return nanoid();
  }

  /** Generate a shorter ID for reports (12 chars) */
  generateShortId(): string {
    return nanoid(12);
  }
}
