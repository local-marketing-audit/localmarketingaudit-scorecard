import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private config: ConfigService) {
    const hex = this.config.getOrThrow<string>('PII_ENCRYPTION_KEY');
    if (hex.length !== 64) {
      throw new Error('PII_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    this.key = Buffer.from(hex, 'hex');
  }

  /** Encrypt a plaintext string. Returns base64-encoded iv.tag.ciphertext */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  /** Decrypt a string produced by encrypt() */
  decrypt(encoded: string): string {
    const [ivB64, tagB64, dataB64] = encoded.split('.');

    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  }

  /** One-way hash for dedup lookups (e.g. email dedup without exposing plaintext) */
  hashForDedup(value: string): string {
    return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
  }
}
