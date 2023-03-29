import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "../posts/posts.model";

interface HashtagsCreationsAttrs {
    title: string
    postId: number
}

@Table({tableName: 'post_hashtags'})
export class Hashtags extends Model<Hashtags, HashtagsCreationsAttrs> {
    @ApiProperty({example: '1', description: "Hashtag id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'IT', description: "Title hashtag"})
    @Column({type: DataType.STRING, allowNull: false})
    title: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
}
