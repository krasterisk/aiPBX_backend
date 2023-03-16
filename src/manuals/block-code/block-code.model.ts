import {BelongsTo, Column, DataType, ForeignKey, HasOne, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "../posts/posts.model";
import {ManualBlockTypes} from "../posts/dto/create-post.dto";

interface CodeCreationAttrs {
    type: ManualBlockTypes.CODE
    code: string
}

@Table({tableName: 'post_codes'})
export class Code extends Model<Code, CodeCreationAttrs> {
    @ApiProperty({example: '1', description: "Post code block id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Type', description: "CODE"})
    @Column({type: DataType.STRING, allowNull: false})
    type: string
    @ApiProperty({example: 'Code', description: "Post code block"})
    @Column({type: DataType.STRING, allowNull: false})
    code: string

    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
