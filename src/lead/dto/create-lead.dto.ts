import { IsString, IsEmail, IsBoolean, MinLength, MaxLength, Equals } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @IsBoolean()
  @Equals(true)
  consentGiven: boolean;
}
