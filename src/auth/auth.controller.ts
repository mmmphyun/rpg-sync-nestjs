import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { RedisService } from '../redis/redis.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import {
  GenerateMagicTokenDto,
  VerifyMagicTokenDto,
  UserSessionDto,
} from './dto/index.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 1. 일회용 매직 토큰 생성 (디스코드 봇 및 온보딩 연동용)
   */
  @Post('magic-token')
  @HttpCode(HttpStatus.CREATED)
  async generateMagicToken(@Body() dto: GenerateMagicTokenDto) {
    const token = await this.authService.createMagicToken(dto.discordId);
    return {
      message: '매직 토큰이 정상 발급되었습니다.',
      token,
      expiresIn: '5m',
    };
  }

  /**
   * 2. 매직 링크 검증 및 세션 쿠키 발급 (1회성 소비 트랜잭션)
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyMagicLink(
    @Body() dto: VerifyMagicTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userData = await this.authService.verifyAndConsumeMagicToken(dto.token);

    if (!userData) {
      throw new BadRequestException('유효하지 않거나 이미 만료된 토큰입니다.');
    }

    const payload: UserSessionDto = {
      discordId: userData.discordId,
      nickname: userData.nickname,
      jobName: userData.jobName,
      serverRole: userData.serverRole,
    };

    const jwtToken = await this.jwtService.signAsync(payload);

    // HttpOnly & Secure 세션 쿠키 설정
    res.cookie('forum_session', jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      path: '/',
    });

    return {
      message: '로그인 인증에 성공했습니다.',
      redirectTo: dto.redirectTo === 'guide' ? '/guide' : '/',
      user: payload,
    };
  }

  /**
   * 3. 현재 로그인 사용자 세션 조회 (AOP Guard 기반)
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: UserSessionDto) {
    return {
      isLoggedIn: true,
      user,
    };
  }

  /**
   * 4. 온보딩 가이드 서약 완료 처리 및 Redis 이벤트 발행
   */
  @Post('complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async completeGuide(@CurrentUser() user: UserSessionDto) {
    // 0. 중복 서약 2차 방어 (중복 서약 및 이벤트 중복 발행 원천 차단)
    const alreadyCompleted = await this.authService.isGuideCompleted(user.discordId);
    if (alreadyCompleted) {
      throw new BadRequestException('이미 가이드 서약이 완료된 정식 멤버입니다.');
    }

    // 1. DB 상태 업데이트
    const success = await this.authService.updateGuideCompletion(user.discordId);
    if (!success) {
      throw new InternalServerErrorException('가이드 상태 업데이트 중 DB 오류가 발생했습니다.');
    }

    // 2. Redis Pub/Sub을 통한 디스코드 봇 역할 변경 신호 전달
    const pubResult = await this.redisService.publish('onboarding:complete', {
      discordId: user.discordId,
      completedAt: new Date().toISOString(),
    });

    return {
      message: 'success',
      subscribersNotified: pubResult,
    };
  }

  /**
   * 5. 로그아웃 (세션 쿠키 즉시 무효화)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('forum_session', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });

    return { message: 'success' };
  }
}
