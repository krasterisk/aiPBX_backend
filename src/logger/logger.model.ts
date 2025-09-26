import {BelongsTo, Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../users/users.model";

interface CreateLogAttr {
    event: string;
    eventId: number;
    userId: number;
}

@Table({ tableName: "systemLogs" })
export class Logs extends Model<Logs, CreateLogAttr> {
    @ApiProperty({example: 'Cloud enter', description: "login to the AI PBX system"})
    @Column({type: DataType.TEXT, allowNull: true})
    event: string;
    @ApiProperty({example: 'Old data', description: "Previous data"})
    @Column({type: DataType.TEXT, allowNull: true})
    oldData: string;
    @ApiProperty({example: 'New data', description: "Updated data"})
    @Column({type: DataType.TEXT, allowNull: true})
    newData: string;
    @ApiProperty({example: '1', description: "Event Id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    eventId: string;

    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER, allowNull: false})
    userId: number
    @BelongsTo(() => User)
    user: User

}
