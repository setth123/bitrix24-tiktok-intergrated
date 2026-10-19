import { Logger } from '@nestjs/common';

// Ẩn log của Nest khi chạy unit test cho output gọn.
Logger.overrideLogger(false);
