import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RedisService } from '../redis/redis.service.js';
import { UserSessionDto } from './dto/index.js';

describe('AuthController (Unit Test)', () => {
  let controller: AuthController;

  const mockUserSession: UserSessionDto = {
    discordId: '123456789012345678',
    nickname: '테스트유저',
    jobName: '전사',
    serverRole: '신입 모험가',
  };

  const mockAuthService = {
    createMagicToken: vi.fn(),
    verifyAndConsumeMagicToken: vi.fn(),
    isGuideCompleted: vi.fn(),
    updateGuideCompletion: vi.fn(),
  };

  const mockJwtService = {
    signAsync: vi.fn().mockResolvedValue('mocked_jwt_token_string'),
    verifyAsync: vi.fn(),
  };

  const mockRedisService = {
    publish: vi.fn().mockResolvedValue(1),
  };

  let mockRequest: any;
  let mockResponse: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockRequest = {
      headers: {
        accept: 'application/json',
      },
    };

    mockResponse = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((data) => data),
      redirect: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('generateMagicToken', () => {
    it('디스코드 ID로 매직 토큰을 정상 발급한다', async () => {
      mockAuthService.createMagicToken.mockResolvedValue('sample_token_123');

      const result = await controller.generateMagicToken({ discordId: mockUserSession.discordId });

      expect(mockAuthService.createMagicToken).toHaveBeenCalledWith(mockUserSession.discordId);
      expect(result.token).toBe('sample_token_123');
      expect(result.expiresIn).toBe('5m');
    });
  });

  describe('verifyMagicLink', () => {
    it('유효한 토큰일 경우 JWT 쿠키를 설정하고 유저 세션을 반환한다 (JSON 클라이언트)', async () => {
      mockAuthService.verifyAndConsumeMagicToken.mockResolvedValue(mockUserSession);

      const result = await controller.verifyMagicLink(
        { token: 'valid_token_sample', redirectTo: 'main' },
        mockRequest,
        mockResponse,
      );

      expect(mockAuthService.verifyAndConsumeMagicToken).toHaveBeenCalledWith('valid_token_sample');
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(mockUserSession);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'forum_session',
        'mocked_jwt_token_string',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
        }),
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockUserSession,
          redirectTo: '/',
        }),
      );
    });

    it('브라우저 Form 제출 시 쿠키 설정 후 지정 경로로 302 리다이렉트한다', async () => {
      mockAuthService.verifyAndConsumeMagicToken.mockResolvedValue(mockUserSession);
      mockRequest.headers['accept'] = 'text/html';

      await controller.verifyMagicLink(
        { token: 'valid_token_sample', redirectTo: 'guide' },
        mockRequest,
        mockResponse,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith('/guide');
    });

    it('만료되었거나 잘못된 토큰이면 BadRequestException을 던진다 (JSON)', async () => {
      mockAuthService.verifyAndConsumeMagicToken.mockResolvedValue(null);

      await expect(
        controller.verifyMagicLink({ token: 'invalid_token' }, mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('AOP Guard를 통해 주입된 현재 사용자 세션을 반환한다', () => {
      const result = controller.getCurrentUser(mockUserSession);
      expect(result.isLoggedIn).toBe(true);
      expect(result.user).toEqual(mockUserSession);
    });
  });

  describe('completeGuide', () => {
    it('가이드 서약 미완료 유저일 경우 DB 업데이트 및 Redis 이벤트를 정상 발행한다', async () => {
      mockAuthService.isGuideCompleted.mockResolvedValue(false);
      mockAuthService.updateGuideCompletion.mockResolvedValue(true);

      const result = await controller.completeGuide(mockUserSession);

      expect(mockAuthService.isGuideCompleted).toHaveBeenCalledWith(mockUserSession.discordId);
      expect(mockAuthService.updateGuideCompletion).toHaveBeenCalledWith(mockUserSession.discordId);
      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'onboarding:complete',
        expect.objectContaining({ discordId: mockUserSession.discordId }),
      );
      expect(result.message).toBe('success');
    });

    it('이미 가이드 서약을 완료한 유저일 경우 400 BadRequestException으로 2차 방어한다', async () => {
      mockAuthService.isGuideCompleted.mockResolvedValue(true);

      await expect(controller.completeGuide(mockUserSession)).rejects.toThrow(
        new BadRequestException('이미 가이드 서약이 완료된 정식 멤버입니다.'),
      );
      expect(mockAuthService.updateGuideCompletion).not.toHaveBeenCalled();
      expect(mockRedisService.publish).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('forum_session 쿠키를 삭제하고 완료 메시지를 반환한다', () => {
      const result = controller.logout(mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'forum_session',
        expect.objectContaining({ path: '/', httpOnly: true }),
      );
      expect(result.message).toBe('success');
    });
  });
});
