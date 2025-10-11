import {IsString} from "class-validator";

export class GetPbxDto {
    @IsString({message: 'Must be a string!'})
    search?: string
    page: number | string = 1
    limit: number | string = 10
}
