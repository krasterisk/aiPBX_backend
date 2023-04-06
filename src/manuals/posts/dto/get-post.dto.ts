import {IsString} from "class-validator";

export class GetPostDto {
    @IsString({message: 'Must be a string!'})
    sort: string = 'createdAt'
    @IsString({message: 'Must be a string!'})
    order: 'asc' | 'desc' = 'desc'
    search?: string
    hashtag?: string | ''
    page: number | string = 1
    limit: number | string = 10
}
