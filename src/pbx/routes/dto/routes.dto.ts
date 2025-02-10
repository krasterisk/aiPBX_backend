import { IsNumber, IsString} from "class-validator";

export class RoutesDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    //@IsNumber({},{message: 'Must be integer'})
    readonly extensions: []
    @IsNumber({allowNaN: false, allowInfinity: false},{message: 'Must be integer'})
    readonly vpbx_user_id: number

}