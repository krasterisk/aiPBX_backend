import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "../posts/posts.model";
import {ManualBlockTypes} from "../posts/dto/create-post.dto";

interface ImageCreationAttrs {
    type: ManualBlockTypes.IMAGE
    title: string
    src: string
}

@Table({tableName: 'post_images'})
export class Image extends Model<Image, ImageCreationAttrs> {
    @ApiProperty({example: '1', description: "Post text id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Title', description: "Image title"})
    @Column({type: DataType.STRING})
    title: string
    @ApiProperty({example: 'Type', description: "IMAGE"})
    @Column({type: DataType.STRING, allowNull: false})
    type: string
    @ApiProperty({example: 'src', description: "Image link"})
    @Column({type: DataType.STRING, allowNull: false})
    src: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
