import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. 미들웨어 등록: URL-encoded Form 바인딩 및 쿠키 파서
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // 2. 정적 에셋 서빙 (루트 및 /static 접두사 둘 다 지원)
  const publicDir = path.join(process.cwd(), 'public');
  app.useStaticAssets(publicDir);
  app.useStaticAssets(publicDir, { prefix: '/static' });

  // 3. Nunjucks 템플릿 엔진 설정 (Jinja2 상속 문법 100% 호환)
  const viewsDir = path.join(process.cwd(), 'views');
  const nunjucksEnv = nunjucks.configure(viewsDir, {
    express: app,
    autoescape: true,
    watch: false,
    noCache: true,
  });

  // Jinja2 템플릿 전역 헬퍼 및 self 객체 등록
  nunjucksEnv.addGlobal('get_mtime', () => Date.now().toString());
  nunjucksEnv.addGlobal('self', {
    og_description: () => 'RPG 서버 마인크래프트 멀티플레이 접속을 위한 정식 안내 가이드입니다.',
  });

  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('html');

  // 4. API 전역 프리픽스 설정 (화면 및 정적 자원은 제외)
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'login',
      'guide',
      '',
      'static/{*path}',
      'images/{*path}',
      'css/{*path}',
      'js/{*path}',
      'fonts/{*path}',
    ],
  });

  // 5. 글로벌 유효성 검증 파이프 등록
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Bootstrap] RPG Sync NestJS Auth Service running on http://localhost:${port}`);
  console.log(`[Bootstrap] Onboarding Guide UI: http://localhost:${port}/guide`);
}

await bootstrap();
