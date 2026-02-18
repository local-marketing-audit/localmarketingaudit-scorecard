import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from './lead.schema';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Lead.name, schema: LeadSchema }])],
  controllers: [LeadController],
  providers: [LeadService],
  exports: [MongooseModule],
})
export class LeadModule {}
