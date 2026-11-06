import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
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
   * - 브라우저 Form 자동 제출 시 302 리다이렉트 지원
   * - REST API 클라이언트 호출 시 JSON 응답 지원
   */
  @Post('verify')
  async verifyMagicLink(
    @Body() dto: VerifyMagicTokenDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userData = await this.authService.verifyAndConsumeMagicToken(dto.token);

    if (!userData) {
      if (req.headers['accept']?.includes('text/html')) {
        return res.redirect('/?error=invalid_token');
      }
      throw new BadRequestException('유효하지 않거나 이미 만료된 토큰입니다.');
    }

    const payload: UserSessionDto = {
      discordId: userData.discordId,
      nickname: userData.nickname,
      jobName: userData.jobName,
      serverRole: userData.serverRole,
    };

    const jwtToken = await this.jwtService.signAsync(payload);

    // HttpOnly 세션 쿠키 설정 (로컬 개발 환경에서는 Secure를 false로 두어 HTTP 쿠키 유실 방지)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('forum_session', jwtToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // 리다이렉트 시 쿠키 전송 보장을 위해 lax 권장
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      path: '/',
    });

    const targetUrl = dto.redirectTo === 'guide' ? '/guide' : '/';

    // 브라우저 Form 제출 시 리다이렉트 수행
    const isFormSubmit =
      req.headers['accept']?.includes('text/html') ||
      req.headers['content-type']?.includes('application/x-www-form-urlencoded');

    if (isFormSubmit) {
      return res.redirect(targetUrl);
    }

    return res.status(HttpStatus.OK).json({
      message: '로그인 인증에 성공했습니다.',
      redirectTo: targetUrl,
      user: payload,
    });
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return { message: 'success' };
  }
}
