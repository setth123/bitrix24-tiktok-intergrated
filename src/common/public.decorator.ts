import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Bỏ qua ApiKeyGuard (webhook có cơ chế xác thực riêng, health check). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
