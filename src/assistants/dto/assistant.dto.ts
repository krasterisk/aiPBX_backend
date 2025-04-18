import {IsNumber, IsObject, IsString} from "class-validator";
import {AiTool} from "../../ai-tools/ai-tool.model";

export class AssistantDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly instruction: string
    @IsObject({message: 'Must be a object'})
    readonly tools?: AiTool[]
    @IsNumber({}, {message: 'Обязательное поле. Должно быть число'})
    readonly userId: number
}
