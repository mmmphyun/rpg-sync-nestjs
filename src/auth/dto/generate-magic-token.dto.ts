import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class GenerateMagicTokenDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{17,20}$/, {
    message: 'discordId는 17~20자리의 디스코드 Snowflake 숫자 문자열이어야 합니다.',
  })
  discordId!: string;
}
