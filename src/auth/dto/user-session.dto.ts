import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UserSessionDto {
  @IsString()
  @IsNotEmpty()
  discordId!: string;

  @IsString()
  @IsNotEmpty()
  nickname!: string;

  @IsString()
  @IsOptional()
  jobName?: string;

  @IsString()
  @IsNotEmpty()
  serverRole!: string;
}

export class CurrentUserResponseDto {
  @IsBoolean()
  isLoggedIn!: boolean;

  @IsOptional()
  user?: UserSessionDto;

  @IsOptional()
  @IsString()
  error?: string;
}
