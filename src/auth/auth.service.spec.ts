import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { User, MagicToken, Job } from '../entities/index.js';

describe('AuthService (Unit Test)', () => {
  let service: AuthService;

  const mockUser: User = {
    discordId: '123456789012345678',
    nickname: '테스트유저',
    serverRole: '신입 모험가',
    currentJobId: 1,
    isGuideCompleted: false,
    bypassVoiceCheck: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    job: { jobId: 1, name: 'warrior', displayName: '전사' },
  };

  const mockMagicToken: MagicToken = {
    token: 'valid_test_token_sample_string_123456',
    discordId: mockUser.discordId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 5),
    createdAt: new Date(),
    user: mockUser,
  };

  const mockUserRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const mockMagicTokenRepository = {
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockJobRepository = {
    findOne: vi.fn(),
  };

  let mockQueryRunner: any;
  let mockDataSource: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockQueryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {
        findOne: vi.fn(),
        delete: vi.fn(),
      },
    };

    mockDataSource = {
      createQueryRunner: vi.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(MagicToken),
          useValue: mockMagicTokenRepository,
        },
        {
          provide: getRepositoryToken(Job),
          useValue: mockJobRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('createMagicToken', () => {
    it('유저가 존재하면 5분 만료 일회용 토큰을 생성하고 DB에 적재한다', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockMagicTokenRepository.create.mockImplementation((dto) => dto);
      mockMagicTokenRepository.save.mockResolvedValue(mockMagicToken);

      const token = await service.createMagicToken(mockUser.discordId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(mockMagicTokenRepository.save).toHaveBeenCalledTimes(1);
    });

    it('유저가 없으면 신규 유저를 자동 생성 후 매직 토큰을 발급한다', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((dto) => ({ ...dto, createdAt: new Date(), updatedAt: new Date() }));
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockMagicTokenRepository.create.mockImplementation((dto) => dto);
      mockMagicTokenRepository.save.mockResolvedValue(mockMagicToken);

      const token = await service.createMagicToken('999999999999999999');

      expect(token).toBeDefined();
      expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
      expect(mockMagicTokenRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyAndConsumeMagicToken (트랜잭션 및 원자적 소비)', () => {
    it('유효한 토큰일 경우 비관적 락으로 조회 후 즉시 삭제하고 유저 세션을 반환한다', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(mockMagicToken) // 1. magic_tokens 비관적 락 조회
        .mockResolvedValueOnce(mockUser); // 2. users 조회
      mockQueryRunner.manager.delete.mockResolvedValue({ affected: 1 });

      const result = await service.verifyAndConsumeMagicToken(mockMagicToken.token);

      expect(mockDataSource.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.manager.delete).toHaveBeenCalledWith(MagicToken, { token: mockMagicToken.token });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        discordId: mockUser.discordId,
        nickname: mockUser.nickname,
        jobName: '전사',
        serverRole: mockUser.serverRole,
      });
    });

    it('토큰이 없거나 만료된 경우 롤백 후 null을 반환한다', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      const result = await service.verifyAndConsumeMagicToken('expired_or_invalid_token');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.delete).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });
  });

  describe('isGuideCompleted & updateGuideCompletion', () => {
    it('가이드 완료 여부를 정확히 조회한다', async () => {
      mockUserRepository.findOne.mockResolvedValue({ discordId: mockUser.discordId, isGuideCompleted: true });

      const completed = await service.isGuideCompleted(mockUser.discordId);
      expect(completed).toBe(true);
    });

    it('가이드 서약 완료 상태를 true로 업데이트한다', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      const success = await service.updateGuideCompletion(mockUser.discordId);
      expect(success).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { discordId: mockUser.discordId },
        { isGuideCompleted: true },
      );
    });
  });
});
