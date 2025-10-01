import {IsArray, IsNumber, IsObject, IsString} from "class-validator";
import {AiTool} from "../../ai-tools/ai-tool.model";

export class AssistantDto {
    @IsString({message: 'name: Must be a string'})
    readonly name: string
    @IsString({message: 'instruction: Must be a string'})
    readonly instruction: string
    @IsArray({message: 'tools: Must be array'})
    readonly tools?: AiTool[]
    @IsNumber({}, {message: 'Обязательное поле. Должно быть число'})
    userId: number
}
