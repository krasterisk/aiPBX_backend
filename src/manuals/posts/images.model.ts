import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "./posts.model";

interface ImageCreationAttrs {
    type: string | 'IMAGE'
    title: string
    src: string
}

@Table({tableName: 'post_texts'})
export class Image extends Model<Image, ImageCreationAttrs> {
    @ApiProperty({example: '1', description: "Post text id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Title', description: "Image title"})
    @Column({type: DataType.STRING, allowNull: false})
    title: string
    @ApiProperty({example: 'src', description: "Image link"})
    @Column({type: DataType.STRING, allowNull: false})
    src: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
