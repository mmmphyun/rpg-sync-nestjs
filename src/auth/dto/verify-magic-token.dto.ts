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
  redirectTo?: string;

  // 기존 HTML 폼(login.html)의 name="redirect_to" 완벽 호환
  @IsString()
  @IsOptional()
  redirect_to?: string;

  getTargetUrl(): string {
    const target = this.redirectTo || this.redirect_to || 'main';
    return target === 'guide' ? '/guide' : '/';
  }
}
