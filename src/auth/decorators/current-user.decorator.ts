import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserSessionDto } from '../dto/index.js';

export const CurrentUser = createParamDecorator(
  (data: keyof UserSessionDto | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserSessionDto;

    return data ? user?.[data] : user;
  },
);
