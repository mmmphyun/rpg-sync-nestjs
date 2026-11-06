import { Module } from '@nestjs/common';
import { ViewController } from './view.controller.js';

@Module({
  controllers: [ViewController],
})
export class ViewModule {}
