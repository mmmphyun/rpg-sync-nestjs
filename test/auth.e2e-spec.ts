import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { UserSessionDto } from '../src/auth/dto/index.js';

describe('AuthModule E2E Test (HTTP 파이프라인 수명주기 검증)', () => {
  let app: INestApplication;
  let authCookie: string;

  const mockUserSession: UserSessionDto = {
    discordId: '123456789012345678',
    nickname: '모험가_1234',
    jobName: '마법사',
    serverRole: '신입 모험가',
  };

  let isCompletedState = false;

  const mockAuthService = {
    createMagicToken: (discordId: string) => Promise.resolve(`magic_token_for_${discordId}`),
    verifyAndConsumeMagicToken: (token: string) => {
      if (token.startsWith('magic_token_for_')) {
        return Promise.resolve(mockUserSession);
      }
      return Promise.resolve(null);
    },
    isGuideCompleted: () => Promise.resolve(isCompletedState),
    updateGuideCompletion: () => {
      isCompletedState = true;
      return Promise.resolve(true);
    },
  };

  const mockRedisService = {
    publish: () => Promise.resolve(1),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({
          secret: 'super-secret-jwt-key-for-rpg-sync-evaluation',
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: RedisService, useValue: mockRedisService },
        JwtAuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. ValidationPipe 데이터 검증 계층 (400 Bad Request 차단)', () => {
    it('discordId 형식이 17~20자리 숫자가 아니면 400 에러를 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/magic-token')
        .send({ discordId: 'invalid_id_not_digits' })
        .expect(400);

      expect(res.body.message).toContain('discordId는 17~20자리의 디스코드 Snowflake 숫자 문자열이어야 합니다.');
    });

    it('DTO에 정의되지 않은 오염된 필드가 전달되면 400 에러로 차단한다', async () => {
      await request(app.getHttpServer())
        .post('/auth/magic-token')
        .send({
          discordId: '123456789012345678',
          hackedField: 'injection_attack',
        })
        .expect(400);
    });
  });

  describe('2. 온보딩 인증 및 세션 쿠키 발급 흐름', () => {
    it('POST /auth/magic-token: 유효한 요청 시 201 Created 및 토큰을 발급한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/magic-token')
        .send({ discordId: mockUserSession.discordId })
        .expect(201);

      expect(res.body.token).toBe(`magic_token_for_${mockUserSession.discordId}`);
    });

    it('POST /auth/verify: 일회용 토큰 검증 시 forum_session HttpOnly 쿠키를 발급한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({
          token: 'magic_token_for_123456789012345678_valid',
          redirectTo: 'guide',
        })
        .expect(200);

      expect(res.body.user).toEqual(mockUserSession);
      expect(res.body.redirectTo).toBe('/guide');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = cookies.find((c: string) => c.startsWith('forum_session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');

      authCookie = sessionCookie.split(';')[0];
    });
  });

  describe('3. JwtAuthGuard 인증 및 권한 제어', () => {
    it('GET /auth/me: 쿠키 없이 접근 시 401 Unauthorized로 차단한다', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/me: 정상 세션 쿠키를 전달하면 사용자 정보를 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', [authCookie])
        .expect(200);

      expect(res.body.isLoggedIn).toBe(true);
      expect(res.body.user.discordId).toBe(mockUserSession.discordId);
    });
  });

  describe('4. 온보딩 가이드 서약 완료 및 Redis 이벤트 발행', () => {
    it('POST /auth/complete: 정상 서약 완료 시 DB 갱신 및 성공 메시지를 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/complete')
        .set('Cookie', [authCookie])
        .expect(200);

      expect(res.body.message).toBe('success');
      expect(res.body.subscribersNotified).toBe(1);
    });

    it('POST /auth/complete: 이미 서약을 완료한 유저가 재호출 시 400 Bad Request로 2차 방어한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/complete')
        .set('Cookie', [authCookie])
        .expect(400);

      expect(res.body.message).toBe('이미 가이드 서약이 완료된 정식 멤버입니다.');
    });
  });

  describe('5. 로그아웃 세션 무효화', () => {
    it('POST /auth/logout: forum_session 쿠키를 삭제하고 성공을 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [authCookie])
        .expect(200);

      expect(res.body.message).toBe('success');
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearCookie = cookies.find((c: string) => c.startsWith('forum_session=;'));
      expect(clearCookie).toBeDefined();
    });
  });
});
