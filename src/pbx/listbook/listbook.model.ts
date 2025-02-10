import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";


interface CreateListbookModelAttr {
    name: string
    phones: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_listbook"})
export class Listbook extends Model<Listbook, CreateListbookModelAttr> {
    @ApiProperty({example: 'Private Person', description: "client name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'name@email.com', description: "email address"})
    @Column({type: DataType.STRING, allowNull: true})
    email: string
    @ApiProperty({example: '012233, New York City', description: "Address"})
    @Column({type: DataType.STRING, allowNull: true})
    address: string
    @ApiProperty({example: '+1023342334', description: "phone numbers"})
    @Column({type: DataType.TEXT, allowNull: true})
    phones: string
    @ApiProperty({example: '233', description: "exten to direct dial"})
    @Column({type: DataType.STRING, allowNull: true})
    dialto: string
    @ApiProperty({example: 'anything', description: "comment"})
    @Column({type: DataType.STRING, allowNull: true})
    comment: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}
