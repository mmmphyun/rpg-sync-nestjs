import { Module } from '@nestjs/common';
import { ViewController } from './view.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ViewController],
})
export class ViewModule {}
