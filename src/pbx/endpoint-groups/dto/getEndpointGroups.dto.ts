import {IsString} from "class-validator";

export class GetEndpointGroupsDto {
    @IsString({message: 'Must be a string!'})
    sort: string = 'name'
    @IsString({message: 'Must be a string!'})
    order: 'asc' | 'desc' = 'desc'
    vpbx_user_id: string = '0'
    search?: string
    page: number | string = 1
    limit: number | string = 10
}
