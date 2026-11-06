import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.config.get<number>('REDIS_PORT', 6380));

    try {
      this.client = new Redis({
        host,
        port,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn(`[RedisService] Redis 연결 재시도 초과 (${times}회). 오프라인 모드로 전환`);
            return null; // 재시도 중단
          }
          return Math.min(times * 100, 2000);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`[RedisService] Redis 연결 성공 (${host}:${port})`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`[RedisService] Redis 연결 경고: ${err.message}`);
      });

      await this.client.connect().catch((err) => {
        this.logger.warn(`[RedisService] 초기 Redis 연결 실패 (모킹 모드로 계속 진행): ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`[RedisService] Redis 클라이언트 초기화 예외: ${err?.message}`);
    }
  }

  /**
   * Redis 채널로 JSON 직렬화 메시지 발행 (Pub/Sub)
   */
  async publish(channel: string, message: any): Promise<number> {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    if (this.client && this.isConnected) {
      try {
        const subscribers = await this.client.publish(channel, payload);
        this.logger.log(`[RedisService] 이벤트 발행 성공 [${channel}] -> 구독자 ${subscribers}명`);
        return subscribers;
      } catch (err: any) {
        this.logger.error(`[RedisService] 이벤트 발행 오류: ${err.message}`);
        return 0;
      }
    } else {
      // Redis 미기동 로컬/테스트 환경용 안전한 로깅 폴백
      this.logger.log(`[RedisService (Offline/Mock)] 이벤트 발행 시뮬레이션 [${channel}]: ${payload}`);
      return 1;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.logger.log('[RedisService] Redis 커넥션 정상 해제');
    }
  }
}
