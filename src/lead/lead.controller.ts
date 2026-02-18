import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller('lead')
export class LeadController {
  constructor(private leadService: LeadService) {}

  @Post('capture')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async capture(@Body() dto: CreateLeadDto) {
    return this.leadService.capture(dto);
  }
}
