# RPG Sync Auth Service (NestJS Refactored)

Python FastAPI(`psycopg2` + Pydantic v2) 기반 RPG Sync 온보딩 및 인증 모듈을 TypeScript / NestJS(`TypeORM` + `class-validator` + `ioredis`) 아키텍처로 리팩토링한 프로젝트입니다.

상세 아키텍처 비교 및 기술 분석 문서는 [ARCHITECTURE_MIGRATION.md](./ARCHITECTURE_MIGRATION.md)를 참조하십시오.

---

## 1. 기술 스택
- **Runtime & Language**: Node.js (v24), TypeScript
- **Framework**: NestJS (v12)
- **ORM & Database**: TypeORM (v1), PostgreSQL 16
- **Cache & Pub/Sub**: ioredis, Redis 7
- **Authentication**: `@nestjs/jwt`, `cookie-parser`, AOP Guards
- **Validation**: `class-validator`, `class-transformer`
- **Testing**: Vitest, Supertest

---

## 2. 프로젝트 실행 방법

### 1) 로컬 인프라 구동 (Docker Compose)
```bash
docker compose up -d
```
- PostgreSQL: `localhost:5433` (DB: `rpg_sync`, User: `rpg_user`)
- Redis: `localhost:6380`

### 2) 패키지 설치 및 서버 구동
```bash
npm install
npm run start:dev
```
- API 서버: `http://localhost:3000`

---

## 3. 테스트 실행

### 단위 테스트 (Unit Tests)
```bash
npm test
```
- AuthService (트랜잭션, 비관적 락, 원자적 토큰 소비): 6건
- AuthController: 7건
- AppController: 1건 (총 14건 전건 통과)

### E2E 통합 테스트 (End-to-End Tests)
```bash
npm run test:e2e
```
- HTTP 파이프라인 전체 수명주기 시나리오: 10건 전건 통과
  - ValidationPipe DTO 오염 차단 (400)
  - 매직 토큰 발급 (201)
  - 매직 링크 검증 및 HttpOnly 쿠키 발급 (200)
  - JwtAuthGuard 미인증 차단 (401) 및 세션 조회 (200)
  - 온보딩 서약 완료 (200) 및 중복 서약 차단 (400)
  - 세션 쿠키 무효화 로그아웃 (200)
