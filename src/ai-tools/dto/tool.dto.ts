import { IsBoolean, IsNumber, IsObject, IsString } from "class-validator";

export class ToolDto {
    @IsString({ message: 'type: Must be a string' })
    readonly type: string
    @IsString({ message: 'name: Must be a string' })
    readonly name: string
    @IsString({ message: 'description: Must be a string' })
    readonly description?: string
    @IsObject({ message: 'parameters: Must be a object' })
    readonly parameters?: string;
    @IsBoolean({ message: 'strict: Must be a boolean' })
    readonly strict?: boolean;
    @IsString({ message: 'webhook: Must be a string' })
    readonly webhook?: string;
    @IsObject({ message: 'headers: Must be an object' })
    readonly headers?: object;
    @IsString({ message: 'method: Must be a string' })
    readonly method?: string;
    @IsNumber({}, { message: 'userId: Must be a number' })
    userId?: number
}
