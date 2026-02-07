import { IsString } from "class-validator";

export class AiModelDto {
    @IsString({ message: 'Must be a string' })
    name: string
    @IsString({ message: 'Must be a string' })
    comment: string
}

export class UpdateAiModelDto {
    id: number;
    name?: string;
    comment?: string;
}
