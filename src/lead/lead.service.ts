import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead, LeadDocument } from './lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { IdService } from '../common/id/id.service';
import { SanitizeService } from '../common/sanitize/sanitize.service';

@Injectable()
export class LeadService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    private encryption: EncryptionService,
    private id: IdService,
    private sanitize: SanitizeService,
  ) {}

  async capture(dto: CreateLeadDto): Promise<{ leadId: string }> {
    const fullName = this.sanitize.sanitize(dto.fullName);
    const email = this.sanitize.sanitize(dto.email).toLowerCase();
    const phone = this.sanitize.sanitize(dto.phone);
    const businessName = this.sanitize.sanitize(dto.businessName);
    const city = this.sanitize.sanitize(dto.city);
    const emailHash = this.encryption.hashForDedup(email);

    // Check for existing lead by email hash (dedup)
    const existing = await this.leadModel.findOne({ emailHash });
    if (existing) {
      return { leadId: existing._id };
    }

    const leadId = this.id.generateId();
    await this.leadModel.create({
      _id: leadId,
      fullName,
      email: this.encryption.encrypt(email),
      emailHash,
      phone,
      businessName: this.encryption.encrypt(businessName),
      city,
      consentGiven: dto.consentGiven,
      tags: ['quiz-lead'],
    });

    return { leadId };
  }
}
