import { IsIn, IsNumber, IsString} from "class-validator";
import {QueueStrategies} from "../queue.model";

export class QueueDto {
    @IsString({message: "Must be a string"})
    readonly name: string
    @IsIn(Object.values(QueueStrategies),
        {message: "Must be: " + Object.values(QueueStrategies).join(',')})
    readonly strategy: QueueStrategies
    @IsNumber({},{message: "Must be integer"})
    readonly vpbx_user_id: number
}