import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "./posts.model";

interface CodeCreationAttrs {
    type: string | 'CODE'
    code: string
}

@Table({tableName: 'post_codes'})
export class Code extends Model<Code, CodeCreationAttrs> {
    @ApiProperty({example: '1', description: "Post code block id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Code', description: "Post code block"})
    @Column({type: DataType.STRING, allowNull: false})
    code: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
