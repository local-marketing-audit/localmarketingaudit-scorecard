import { Module, Global } from '@nestjs/common';
import { EncryptionService } from './encryption/encryption.service';
import { ScoringService } from './scoring/scoring.service';
import { IdService } from './id/id.service';
import { SanitizeService } from './sanitize/sanitize.service';

@Global()
@Module({
  providers: [EncryptionService, ScoringService, IdService, SanitizeService],
  exports: [EncryptionService, ScoringService, IdService, SanitizeService],
})
export class CommonModule {}
