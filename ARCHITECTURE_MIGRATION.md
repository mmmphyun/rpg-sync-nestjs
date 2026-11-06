# RPG Sync 백엔드 아키텍처 전환 분석서 (FastAPI -> NestJS)

## 1. 시스템 개요 및 마이그레이션 배경
본 문서는 커뮤니티 연동 시스템(RPG Sync)의 핵심 도메인인 **'온보딩 서약 및 인증(Auth) 모듈'**을 Python FastAPI(`psycopg2`, Pydantic v2)에서 TypeScript / NestJS(`TypeORM`, `class-validator`) 아키텍처로 리팩토링하며 도출한 계층별 기술적 차이, 저수준 CS 원리 및 설계 트레이드오프를 체계적으로 정리한 실무 기술 문서입니다.

### 1.1 전환 대상 기능 명세
- **일회용 매직 토큰 발급 (`POST /auth/magic-token`)**: 디스코드 봇 및 온보딩 유저를 위한 5분 유효기간 URL-safe 토큰 발급.
- **매직 링크 검증 및 세션 발급 (`POST /auth/verify`)**: 토큰 유효성 검증과 원자적 1회성 소비(SELECT & DELETE 트랜잭션), JWT 발급 및 HttpOnly/Secure 쿠키 주입.
- **현재 세션 조회 (`GET /auth/me`)**: JWT 쿠키 파싱 및 가드(Guard) 기반 유저 상태 조회.
- **온보딩 서약 완료 및 이벤트 발행 (`POST /auth/complete`)**: 중복 서약 방어, DB 플래그 업데이트, Redis Pub/Sub을 통한 분산 컴포넌트(디스코드 봇) 동기화.
- **로그아웃 (`POST /auth/logout`)**: 세션 쿠키 무효화.

---

## 2. 데이터 검증 계층: Pydantic v2 vs TypeScript DTO & class-validator

### 2.1 런타임 타입 소거(Type Erasure)와 메타데이터 리플렉션
- **Python (Pydantic v2)**:
  - Python은 런타임 동적 타이핑 언어로, 런타임에도 객체의 타입 정보가 살아있습니다.
  - Pydantic v2는 코어 엔진(`pydantic-core`)이 Rust로 컴파일되어 있어, 들어오는 HTTP 요청 페이로드(dict)를 런타임에 직접 순회하며 타입 검증과 강제 형변환(Type Coercion)을 고속으로 수행합니다.
- **TypeScript (NestJS DTO)**:
  - TypeScript의 정적 타입 시스템은 컴파일 타임에만 유효하며, JavaScript로 트랜스파일되는 즉시 모든 인터페이스와 타입 어노테이션이 소거(Type Erasure)됩니다.
  - 따라서 컴파일된 런타임 환경에서 요청 JSON의 필드 유효성을 검증하기 위해서는 단순 타입 선언만으로는 불가능하며, `reflect-metadata` 라이브러리를 통해 프로토타입에 데코레이터 메타데이터를 보존해야 합니다.
  - NestJS의 `ValidationPipe`는 런타임에 `class-transformer`로 평문 JavaScript 객체를 DTO 클래스 인스턴스로 역직렬화한 뒤, `class-validator`가 프로토타입 메타데이터를 조회하여 검증 규칙을 실행합니다.

### 2.2 오염된 페이로드(Payload Pollution) 차단 전략
- **FastAPI**:
  ```python
  class GenerateTokenSchema(BaseModel):
      model_config = ConfigDict(extra="forbid") # 명시되지 않은 필드 유입 시 422 에러
      discord_id: str = Field(..., pattern=r"^\d{17,20}$")
  ```
- **NestJS**:
  ```typescript
  // main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // DTO에 정의되지 않은 필드 스트리핑
      forbidNonWhitelisted: true, // 화이트리스트 외 필드 존재 시 400 Bad Request 차단
      transform: true,            // DTO 인스턴스로 자동 변환
    }),
  );
  ```
- **설계적 차이**: FastAPI는 개별 Pydantic 모델의 `ConfigDict` 또는 전역 세팅으로 처리하지만, NestJS는 파이프라인 아키텍처(Global Pipe) 수준에서 요청이 컨트롤러 핸들러에 도달하기 전 선행 필터링을 강제합니다.

### 2.3 코드 1:1 대조

#### [Python FastAPI] 라우터 매개변수 및 Form 바인딩
```python
# 기존 src/web/routers/auth.py
@router.post("/verify")
@limiter.limit("5/minute")
def verify_magic_link(
    request: Request, 
    token: str = Form(...), 
    redirect_to: str = Form("main")
):
    # Form(...) 필드 검증이 라우터 함수 인자에 강결합됨
    user_data = verify_and_consume_magic_token(token)
    ...
```

#### [NestJS] DTO 분리 및 데코레이터 선언
```typescript
// src/auth/dto/verify-magic-token.dto.ts
export class VerifyMagicTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(32, 64, {
    message: 'token은 32~64자의 일회용 URL-safe 문자열이어야 합니다.',
  })
  token!: string;

  @IsString()
  @IsOptional()
  redirectTo?: string = 'main';
}

// src/auth/auth.controller.ts
@Post('verify')
verifyMagicLink(@Body() dto: VerifyMagicTokenDto) {
  // 컨트롤러는 순수한 검증 완료 객체만 다루며 검증 로직과 완전히 분리됨
  ...
}
```

### 2.4 설계 트레이드오프 및 고려사항
1. **유연성 vs 명시성**:
   - Python Pydantic은 암묵적 형변환(예: 문자열 `"123"`을 숫자 `123`으로 자동 변환)을 기본 허용하는 경향이 강해 예기치 못한 데이터 오염이 발생할 수 있습니다.
   - NestJS + `class-validator`는 엄격한 데코레이터 규칙을 기반으로 명시적인 변환(`@Type()`)이 없으면 타입을 엄격히 거부하여 API 계약(Contract)의 무결성을 보장합니다.
2. **런타임 오버헤드**:
   - Pydantic v2는 Rust 레벨에서 CPython 메모리를 직접 다루므로 직렬화 속도가 매우 빠릅니다.
   - NestJS는 JavaScript 힙 상에서 `class-transformer`의 재귀적 인스턴스 복사와 `class-validator`의 리플렉션 순회 비용이 발생하므로, 거대 페이로드 처리 시 `@Transform()` 비용에 유의해야 합니다.


---

## 3. 영속성 및 동시성 트랜잭션: psycopg2 동기 풀 vs TypeORM 비동기 QueryRunner

### 3.1 I/O 모델과 이벤트 루프 처리 차이 (CS 저수준 원리)
- **Python (psycopg2) + asyncio.to_thread**:
  - `psycopg2`는 C-extension 기반의 동기 블로킹 드라이버입니다. 소켓 버퍼에서 패킷을 읽거나 쓰는 동안 OS 스레드를 직접 블로킹합니다.
  - FastAPI의 `async` 이벤트 루프 메인 스레드에서 `psycopg2` 쿼리를 직접 호출하면 루프 전체가 멈춰 다른 HTTP 요청의 처리가 지연됩니다.
  - 이를 방지하기 위해 기존 코드에서는 `await asyncio.to_thread(update_guide_completion, discord_id)`를 호출하여 표준 라이브러리의 `ThreadPoolExecutor`(기본 스레드 풀)로 작업을 위임했습니다.
  - 이 방식은 I/O 작업마다 Python GIL(Global Interpreter Lock) 해제/획득 및 OS 스레드 컨텍스트 스위칭(Context Switching) 비용이 발생합니다.
- **Node.js (pg) + TypeORM 비동기 커넥션 풀**:
  - Node.js의 `pg` 드라이버는 libuv의 이벤트 루프와 비동기 TCP 스트림 소켓(Windows IOCP, Linux epoll)을 기반으로 동작합니다.
  - DB 쿼리 전송 후 응답 패킷을 기다리는 동안 스레드가 차단되지 않으며, OS 커널로부터 I/O 완료 통지를 받을 때까지 메인 이벤트 루프는 다른 HTTP 요청을 자유롭게 처리합니다.
  - 별도의 작업 스레드 풀 생성이나 컨텍스트 스위칭 오버헤드 없이 순수 비동기 논블로킹(Non-blocking)으로 동작하여 고동시성 I/O 처리 효율이 우수합니다.

### 3.2 일회용 토큰 소비 시 Race Condition (Double-Spend) 방어 설계
- **문제 상황 (TOCTOU: Time-of-Check to Time-of-Use)**:
  - 사용자가 매직 링크 검증 버튼을 따닥(더블 클릭)하거나 네트워크 지연으로 인해 동일한 토큰으로 2개의 `POST /verify` 요청이 수 밀리초 차이로 유입되는 상황.
  - 격리 제어 없이 단순 `SELECT` 후 `DELETE`를 수행하면 두 트랜잭션 모두 토큰이 유효하다고 판별하여 중복 세션 쿠키가 발급되는 취약점이 발생합니다.
- **TypeORM QueryRunner를 통한 원자적 해결**:
  ```typescript
  // src/auth/auth.service.ts
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('READ COMMITTED');

  try {
    // 비관적 쓰기 락(SELECT ... FOR UPDATE)으로 동시 접근 스레드/트랜잭션 대기 강제
    const magicToken = await queryRunner.manager.findOne(MagicToken, {
      where: { token, expiresAt: MoreThan(new Date()) },
      relations: { user: { job: true } },
      lock: { mode: 'pessimistic_write' },
    });

    if (!magicToken || !magicToken.user) {
      await queryRunner.rollbackTransaction();
      return null;
    }

    // 동일 트랜잭션 내에서 즉시 삭제하여 1회성 보장
    await queryRunner.manager.delete(MagicToken, { token });
    await queryRunner.commitTransaction();

    return sessionDto;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release(); // 풀로 커넥션 안전 반환
  }
  ```

### 3.3 코드 1:1 대조

#### [Python FastAPI] psycopg2 수동 트랜잭션 및 RealDictCursor
```python
# 기존 src/database/auth.py
def verify_and_consume_magic_token(token: str) -> dict:
    select_sql = """
        SELECT m.discord_id, u.nickname, u.server_role, j.display_name AS job_name
        FROM public.magic_tokens m
        JOIN public.users u ON m.discord_id = u.discord_id
        LEFT JOIN public.jobs j ON u.current_job_id = j.job_id
        WHERE m.token = %s AND m.expires_at > NOW()
    """
    delete_sql = "DELETE FROM public.magic_tokens WHERE token = %s"

    conn = get_connection() # 수동 커넥션 풀 획득
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute(select_sql, (token,))
        result = cursor.fetchone()
        if result:
            cursor.execute(delete_sql, (token,))
            conn.commit()
            return dict(result)
        return None
    except psycopg2.Error as e:
        conn.rollback()
        return None
    finally:
        cursor.close()
        release_connection(conn) # 수동 커넥션 반환
```

#### [NestJS TypeORM] Unit of Work 및 QueryRunner 트랜잭션
- 위 3.2절에 기술된 `verifyAndConsumeMagicToken` 구현과 같이, 수동 연결/해제 대신 TypeORM의 `QueryRunner`를 활용하여 Connection Pool 누수(`conn.release()`)를 `finally` 블록에서 완벽히 보장하고 비관적 락으로 원자성을 격리합니다.
- 또한 TypeORM v1의 엄격한 관계 매핑(`relations: { user: { job: true } }`)을 통해 쿼리 조인 오타를 컴파일 타임에 원천 차단합니다.


---

## 4. 요청 수명주기 및 인증 제어: FastAPI Depends vs NestJS Guard & Decorator

### 4.1 의존성 주입 모델과 실행 시점의 차이
- **FastAPI (함수형 매개변수 리졸빙)**:
  - 엔드포인트 핸들러 함수의 시그니처에 `Depends()`를 직접 주입합니다.
  ```python
  @router.get("/me")
  def get_current_user(forum_session: str = Depends(cookie_scheme)):
      if not forum_session:
          return {"is_logged_in": False}
      ...
  ```
  - 요청이 들어오면 FastAPI는 파라미터 그래프를 순회하며 종속 함수를 실행합니다. 그러나 비즈니스 핸들러와 인증 검증 코드가 매개변수 수준에서 결합되어 있어, 인증 실패 시의 응답 규격이 라우터 내부 조건문에 분산되는 경향이 있습니다.
- **NestJS (AOP 기반 요청 수명주기 파이프라인)**:
  - NestJS는 요청이 컨트롤러에 도달하기 전 정해진 수명주기 파이프라인을 통과합니다:
    `Incoming Request -> Middleware -> Guard -> Interceptor (Pre) -> Pipe -> Controller -> Service -> Interceptor (Post) -> Exception Filter -> Response`
  - **`JwtAuthGuard`의 역할**:
    - 비즈니스 로직(Controller) 진입 전 관점 지향(AOP) 방식으로 요청을 가로채 세션 쿠키(`forum_session`)의 유효성을 검증합니다.
    - 세션이 없거나 서명이 변조된 경우 컨트롤러 핸들러를 아예 실행하지 않고 `401 Unauthorized` 예외를 즉각 반환합니다.
    - 검증 성공 시 `request.user`에 복호화된 페이로드를 바인딩합니다.

### 4.2 관심사 분리와 커스텀 데코레이터 (`@CurrentUser`)
- **FastAPI**: 핸들러 내부에서 `request` 객체를 직접 참조하거나 `user: dict = Depends(get_required_user)`로 딕셔너리를 수신.
- **NestJS**: `createParamDecorator`를 통해 프레임워크 독립적인 순수 파라미터 데코레이터 구현:
  ```typescript
  // src/auth/decorators/current-user.decorator.ts
  export const CurrentUser = createParamDecorator(
    (data: keyof UserSessionDto | undefined, ctx: ExecutionContext) => {
      const request = ctx.switchToHttp().getRequest();
      const user = request.user as UserSessionDto;
      return data ? user?.[data] : user;
    },
  );

  // src/auth/auth.controller.ts
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: UserSessionDto) {
    return { isLoggedIn: true, user };
  }
  ```
- **효과**: 컨트롤러는 Express의 `req`, `res` 저수준 객체를 알 필요가 없으며, 타입 세이프한 `UserSessionDto`만 주입받아 비즈니스 응답 생성에만 전념합니다.

---

## 5. 이벤트 주도 아키텍처 및 E2E 실측 검증: Redis Pub/Sub 메시징 분리

### 5.1 메시징 계층의 결합도 완화 (Provider 패턴)
- **FastAPI**: 모듈 레벨 전역 함수 `publish_message("onboarding:complete", ...)`를 라우터 핸들러에서 직접 import하여 호출. 인프라 설정 변경이나 테스트 시 모킹이 번거로움.
- **NestJS**: `RedisService`를 싱글톤 Provider로 캡슐화하고 `@Global()` 모듈로 등록.
  - 생성자 주입(`constructor(private readonly redisService: RedisService)`)을 통해 비즈니스 서비스와 물리 브로커 간의 결합도를 낮춤.
  - `ioredis` 연결 실패 시에도 애플리케이션 부팅이 크래시되지 않도록 연결 재시도 상한 및 오프라인 폴백 로깅 메커니즘을 적용하여 회복 탄력성(Resilience) 확보.

### 5.2 E2E 통합 테스트 실측 검증 결과
Supertest 기반의 통합 테스트(`test/auth.e2e-spec.ts`)를 구축하여 HTTP 파이프라인 전체 수명주기를 검증했습니다.

```bash
$ npm run test:e2e

 RUN  v4.1.12 C:/work/rpg-sync-nestjs

 ✓ test/app.e2e-spec.ts (1 test) 114ms
 ✓ test/auth.e2e-spec.ts (9 tests) 159ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  1.10s
```

#### 통과된 5대 핵심 시나리오
1. **페이로드 오염 및 정규식 검증 차단**: `POST /auth/magic-token` 호출 시 비인가 필드 주입 및 Snowflake 규칙 위반 시 `400 Bad Request` 즉시 차단.
2. **원자적 토큰 소비 및 세션 발급**: `POST /auth/verify` 호출 시 유효 토큰에 대해 `HttpOnly; SameSite=Strict` 쿠키 수령.
3. **Guard 인가 차단 및 세션 복원**: `GET /auth/me` 호출 시 쿠키 미포함 요청은 `401 Unauthorized` 차단, 쿠키 포함 요청은 200 OK 및 사용자 프로필 반환.
4. **온보딩 2차 방어 및 Redis 발행**: `POST /auth/complete` 호출 시 첫 요청은 DB 갱신 및 `onboarding:complete` 이벤트 발행 성공, 동일 세션 재요청 시 `400 Bad Request("이미 가이드 서약이 완료된 정식 멤버입니다.")`로 중복 차단.
5. **세션 파기**: `POST /auth/logout` 호출 시 세션 쿠키 무효화 헤더 정상 반환.

---

## 6. 결론: 핵심 아키텍처 전환 요약

| 비교 항목 | Python FastAPI (RPG Sync As-Is) | TypeScript NestJS (To-Be) | 엔지니어링 실익 |
| :--- | :--- | :--- | :--- |
| **I/O 및 동시성** | `psycopg2` C 동기 드라이버 + `asyncio.to_thread` 스레드 풀 | Node.js libuv 비동기 이벤트 루프 + TypeORM 비동기 풀 | 스레드 컨텍스트 스위칭 오버헤드 제거, I/O 확장성 극대화 |
| **데이터 검증** | Rust 기반 Pydantic v2 런타임 강제 형변환 | DTO + `class-validator` + `reflect-metadata` | 런타임 타입 소거 극복, 데코레이터 기반 엄격한 계약(Contract) 보장 |
| **인증/인가** | 라우터 매개변수 레벨 함수형 `Depends()` 바인딩 | AOP 기반 `JwtAuthGuard` + `@CurrentUser()` 데코레이터 | 비즈니스 로직과 보안 관심사의 완전한 분리, 단일 책임 원칙(SRP) 준수 |
| **트랜잭션 제어** | 수동 Connection/Cursor 관리 및 명시적 `commit()` | TypeORM `QueryRunner` + Unit of Work 트랜잭션 | 누수 없는 안전한 풀 반환 및 비관적 락(`pessimistic_write`) 원자성 확보 |
| **외부 연동** | 라우터 내부 전역 함수 직접 호출 | `@Injectable()` Provider 기반 `RedisService` DI | DIP(의존성 역전) 준수, 단위/E2E 테스트 격리 용이성 |
