import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {Image} from "../block-image/block-image.model";
import {Code} from "../block-code/block-code.model";
import {Text} from "../block-text/block-text.model";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "./posts.model";

interface BlockCreationAttrs {
    textId: number
    imageId: number
    codeId: number
}

@Table({tableName: 'post_blocks'})
export class Block extends Model<Block, BlockCreationAttrs> {
    @ApiProperty({example: '1', description: "Post block id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ForeignKey(() => Text)
    @Column({type: DataType.INTEGER})
    textId: number
    @ForeignKey(() => Image)
    @Column({type: DataType.INTEGER})
    imageId: number
    @ForeignKey(() => Code)
    @Column({type: DataType.INTEGER})
    codeId: number
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
