import {IsString} from "class-validator";

export class GetUsersDto {
    @IsString({message: 'Must be a string!'})
    sort: string = 'name'
    @IsString({message: 'Must be a string!'})
    order: 'asc' | 'desc' = 'desc'
    search?: string
    page: number | string = 1
    limit: number | string = 10
}
