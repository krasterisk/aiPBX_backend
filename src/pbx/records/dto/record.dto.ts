import {IsNumber, IsString} from "class-validator";

export class RecordDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsNumber({},{message: 'Must be integer'})
    readonly vpbx_user_id: number

}
