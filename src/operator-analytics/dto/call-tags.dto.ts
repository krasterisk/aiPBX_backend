import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateCallTagsDto {
    @ApiProperty({
        example: ['returns', 'billing'],
        description: 'Theme ids from the project callTaxonomy',
        type: [String],
    })
    @IsArray()
    @ArrayMaxSize(10)
    @ArrayUnique()
    @IsString({ each: true })
    @MaxLength(50, { each: true })
    tagIds: string[];
}
