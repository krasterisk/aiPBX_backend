import { IsEnum, IsObject, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMcpPolicyDto {
    @ApiProperty({ example: 'rate_limit', enum: ['param_restrict', 'rate_limit', 'require_approval'] })
    @IsEnum(['param_restrict', 'rate_limit', 'require_approval'], { message: 'policyType: Must be param_restrict, rate_limit or require_approval' })
    readonly policyType: 'param_restrict' | 'rate_limit' | 'require_approval';

    @ApiProperty({ example: { maxCallsPerMinute: 10 } })
    @IsObject({ message: 'policyConfig: Must be an object' })
    readonly policyConfig: any;

    @ApiProperty({ example: 1 })
    @IsNumber({}, { message: 'mcpToolRegistryId: Must be a number' })
    readonly mcpToolRegistryId: number;
}
