import { IsIn, IsOptional, IsString } from "class-validator";

export class AiModelDto {
    @IsString({ message: 'Must be a string' })
    name: string

    @IsString({ message: 'Must be a string' })
    publishName: string

    @IsString({ message: 'Must be a string' })
    comment: string

    @IsOptional()
    @IsIn(['openai', 'yandex', 'qwen'], { message: 'realtimeVendor must be openai, yandex, or qwen' })
    realtimeVendor?: 'openai' | 'yandex' | 'qwen'

    @IsOptional()
    @IsString({ message: 'Must be a string' })
    wireModelId?: string
}

export class UpdateAiModelDto {
    id: number;
    name?: string;
    publish?: boolean;
    publishName?: string;
    comment?: string;

    @IsOptional()
    @IsIn(['openai', 'yandex', 'qwen'], { message: 'realtimeVendor must be openai, yandex, or qwen' })
    realtimeVendor?: 'openai' | 'yandex' | 'qwen' | null;

    @IsOptional()
    @IsString({ message: 'Must be a string' })
    wireModelId?: string | null;
}
