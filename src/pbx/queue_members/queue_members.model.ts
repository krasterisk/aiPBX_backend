import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateQueueMembersAttr {
    queue_name: string
    interface: string
}

@Table({tableName: "pbx_queue_members", createdAt: false, updatedAt: false})
export class QueueMembers extends Model<QueueMembers, CreateQueueMembersAttr> {
//    @ApiProperty({example: '1', description: "Autoincrement primary key"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    uniqueid: number
    @ApiProperty({example: 'Ops', description: "Queue name"})
    @Column({type: DataType.STRING({length: 80}), allowNull: false})
    queue_name: string
    @ApiProperty({example: 'PJSIP/101', description: "Member interface"})
    @Column({type: DataType.STRING({length: 80}), allowNull: false})
    interface: string
    @ApiProperty({example: 'Op1', description: "Member name"})
    @Column({type: DataType.STRING})
    membername: string
//    @ApiProperty({example: 'Op1', description: "Member name"})
    @Column({type: DataType.STRING})
    state_interface: string
    @ApiProperty({example: '1', description: "Penalty"})
    @Column({type: DataType.INTEGER})
    penalty: number
    @ApiProperty({example: '0', description: "Pause: 0. Unpause: 1"})
    @Column({type: DataType.INTEGER})
    paused: number
}