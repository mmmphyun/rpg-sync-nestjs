import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 쿠키 파서 미들웨어 등록 (HttpOnly forum_session 쿠키 추출용)
  app.use(cookieParser());

  // 글로벌 유효성 검증 파이프 등록
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 정의되지 않은 속성은 자동 제거
      forbidNonWhitelisted: true, // 정의되지 않은 속성 포함 시 400 Bad Request
      transform: true, // 요청 페이로드를 DTO 인스턴스로 자동 변환
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Bootstrap] RPG Sync NestJS Auth Service running on port ${port}`);
}

await bootstrap();
