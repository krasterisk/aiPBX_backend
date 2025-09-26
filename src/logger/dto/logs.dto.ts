import {IsNumber, IsString} from "class-validator";

export class LogsDto {
    @IsString({message: 'Must be a string'})
    readonly event: string
    @IsNumber({}, {message: 'Must be a number'})
    readonly eventId: number
    @IsNumber({}, {message: 'Must be a number'})
    readonly userId: number
}
