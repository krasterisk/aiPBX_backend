import {IsString} from "class-validator";

export class GetEndpointsDto {
    @IsString({message: 'Must be a string!'})
    sort: string = 'username'
    @IsString({message: 'Must be a string!'})
    order: 'asc' | 'desc' = 'desc'
    search?: string
    group?: string | number = ''
    page: number | string = 1
    limit: number | string = 10
}
