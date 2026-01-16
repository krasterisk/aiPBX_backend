import { IsString } from 'class-validator';

export class GeneratePromptDto {
    @IsString()
    readonly assistantId: string;

    @IsString()
    readonly prompt: string;
}
