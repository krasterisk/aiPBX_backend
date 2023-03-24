import {BelongsTo, Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "../posts/posts.model";
import {User} from "../../users/users.model";

interface CommentCreationAttrs {
    title: string
    userId: number
    postId: number
}

@Table({tableName: 'post_comments'})
export class Comments extends Model<Comments, CommentCreationAttrs> {
    @ApiProperty({example: '1', description: "Comment id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Text comment', description: "Text comment"})
    @Column({type: DataType.STRING, allowNull: false})
    text: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number

    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number
    @BelongsTo(() => User)
    user: User
}
