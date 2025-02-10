import { IsString} from "class-validator";

export class QueueMemberDto {
    @IsString({message: "Must be a string"})
    readonly queue_name: string
    @IsString({message: "Must be a string"})
    readonly interface: string

}