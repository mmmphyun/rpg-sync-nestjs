import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VerifyMagicTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(32, 64, {
    message: 'token은 32~64자의 일회용 URL-safe 문자열이어야 합니다.',
  })
  token!: string;

  @IsString()
  @IsOptional()
  redirectTo?: string = 'main';
}
