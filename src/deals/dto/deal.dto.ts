import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../leads/dto/list-leads.dto';

export class ListDealsDto extends PaginationDto {
  @IsOptional() @IsIn(['open', 'won', 'lost']) status?: string;
  @IsOptional() @IsString() assigned_to?: string;
}

/** Convert thủ công; field nào bỏ trống thì lấy theo rule khớp hoặc mặc định. */
export class ConvertLeadDto {
  @IsOptional() @IsString() pipeline_id?: string;
  @IsOptional() @IsString() stage_id?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @IsOptional() @IsString() assigned_to?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
}
