import {IsString} from "class-validator";

export class GetAssistantsDto {
    @IsString({message: 'Must be a string!'})
    userId: string = '0'
    @IsString({message: 'Must be a string!'})
    search?: string
    page: number | string = 1
    limit: number | string = 10
}
