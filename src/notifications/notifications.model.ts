import {BelongsTo, Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../users/users.model";


interface CreateNotificationAttr {
    title: string
    description: string
    userId: number
}

@Table({tableName: "notifications"})
export class Notifications extends Model<Notifications, CreateNotificationAttr> {
    @ApiProperty({example: '1', description: "Autoincrement"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'New message', description: "New message notification"})
    @Column({type: DataType.STRING, allowNull: false})
    title: string
    @ApiProperty({example: 'Message from Jane'})
    @Column({type: DataType.TEXT, allowNull: true})
    description: string
    @ApiProperty({example: 'https://sample.org', description: "Link(optional)"})
    @Column({type: DataType.TEXT, allowNull: true})
    href: string
    @ApiProperty({example: '1', description: "user id"})
    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number
    @BelongsTo(() => User)
    user: User
}
