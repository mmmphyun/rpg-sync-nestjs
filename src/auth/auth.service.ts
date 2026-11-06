import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { User, MagicToken, Job } from '../entities/index.js';
import { UserSessionDto } from './dto/index.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MagicToken)
    private readonly magicTokenRepository: Repository<MagicToken>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 5분 후 만료되는 일회용 매직 토큰 생성 및 DB 적재
   */
  async createMagicToken(discordId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

    // 유저가 존재하지 않는 경우 기본 테스트 유저 자동 생성 (온보딩 테스트 편의성)
    let user = await this.userRepository.findOne({ where: { discordId } });
    if (!user) {
      user = this.userRepository.create({
        discordId,
        nickname: `User_${discordId.slice(-4)}`,
        serverRole: '신입 모험가',
        isGuideCompleted: false,
      });
      await this.userRepository.save(user);
      this.logger.log(`[AuthService] 신규 테스트 유저 자동 등록 완료: ${discordId}`);
    }

    const magicToken = this.magicTokenRepository.create({
      token,
      discordId,
      expiresAt,
    });

    await this.magicTokenRepository.save(magicToken);
    this.logger.log(`[AuthService] 일회용 매직 토큰 발급 완료 (discordId: ${discordId})`);
    return token;
  }

  /**
   * 일회용 매직 토큰 검증 및 트랜잭션 내 원자적 즉시 소비 (Double-Spend 원천 차단)
   */
  async verifyAndConsumeMagicToken(token: string): Promise<UserSessionDto | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // 1. magic_tokens 행에만 비관적 쓰기 락 획득 (PostgreSQL의 LEFT JOIN outer join lock 에러 방어)
      const magicToken = await queryRunner.manager.findOne(MagicToken, {
        where: {
          token,
          expiresAt: MoreThan(new Date()),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!magicToken) {
        await queryRunner.rollbackTransaction();
        this.logger.warn(`[AuthService] 유효하지 않거나 만료된 매직 토큰 검증 실패: ${token}`);
        return null;
      }

      // 2. 동일 트랜잭션 내 즉시 삭제하여 1회성 소비(Double-Spend) 보장
      await queryRunner.manager.delete(MagicToken, { token });

      // 3. 유저 및 직업 정보 조회
      const user = await queryRunner.manager.findOne(User, {
        where: { discordId: magicToken.discordId },
        relations: { job: true },
      });

      if (!user) {
        await queryRunner.rollbackTransaction();
        return null;
      }

      await queryRunner.commitTransaction();

      this.logger.log(`[AuthService] 매직 토큰 정상 소비 완료 (discordId: ${user.discordId})`);

      return {
        discordId: user.discordId,
        nickname: user.nickname,
        jobName: user.job?.displayName ?? '직업 없음',
        serverRole: user.serverRole,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`[AuthService] 매직 토큰 검증 트랜잭션 롤백: ${error}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 유저의 가이드 서약 완료 여부 확인
   */
  async isGuideCompleted(discordId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { discordId },
      select: {
        discordId: true,
        isGuideCompleted: true,
      },
    });
    return user?.isGuideCompleted ?? false;
  }

  /**
   * 유저의 가이드 서약 완료 상태 업데이트
   */
  async updateGuideCompletion(discordId: string): Promise<boolean> {
    const result = await this.userRepository.update(
      { discordId },
      { isGuideCompleted: true },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * 디스코드 ID 기반 유저 세션 정보 조회
   */
  async getUserSession(discordId: string): Promise<UserSessionDto | null> {
    const user = await this.userRepository.findOne({
      where: { discordId },
      relations: {
        job: true,
      },
    });

    if (!user) return null;

    return {
      discordId: user.discordId,
      nickname: user.nickname,
      jobName: user.job?.displayName ?? '직업 없음',
      serverRole: user.serverRole,
    };
  }
}
