import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    10;
}

export class ListLeadsDto extends PaginationDto {
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsIn(['new', 'synced', 'converted']) status?: string;
  @IsOptional() @IsString() campaign_id?: string;
}
