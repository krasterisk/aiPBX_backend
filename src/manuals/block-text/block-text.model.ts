import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "../posts/posts.model";
import {ManualBlockTypes} from "../posts/dto/create-post.dto";

interface TextCreationAttrs {
    type: ManualBlockTypes.TEXT
    title: string
    paragraphs: string
}

@Table({tableName: 'post_texts'})
export class Text extends Model<Text, TextCreationAttrs> {
    @ApiProperty({example: '1', description: "Post text id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Title', description: "Post text title"})
    @Column({type: DataType.STRING, allowNull: false})
    title: string
    @ApiProperty({example: 'Type', description: "TEXT"})
    @Column({type: DataType.STRING, allowNull: false})
    type: string
    @ApiProperty({example: 'Paragraphs', description: "Post paragraphs"})
    @Column({type: DataType.TEXT, allowNull: false})
    paragraphs: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
