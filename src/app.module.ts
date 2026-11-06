import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ViewModule } from './view/view.module.js';
import { User, Job, MagicToken } from './entities/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST', 'localhost'),
        port: Number(config.get<number>('DATABASE_PORT', 5433)),
        username: config.get<string>('DATABASE_USER', 'rpg_user'),
        password: config.get<string>('DATABASE_PASSWORD', 'rpg_password'),
        database: config.get<string>('DATABASE_NAME', 'rpg_sync'),
        entities: [User, Job, MagicToken],
        synchronize: true,
        logging: false,
      }),
    }),
    RedisModule,
    AuthModule,
    ViewModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
