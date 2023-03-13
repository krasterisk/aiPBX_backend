import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../../users/users.model";
import {Post} from "./posts.model";

interface CommentCreationAttrs {
    body: string
}

@Table({tableName: 'post_comments'})
export class Comment extends Model<Comment, CommentCreationAttrs> {
    @ApiProperty({example: '1', description: "Comment id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Body', description: "Body comment"})
    @Column({type: DataType.STRING, allowNull: false})
    body: string

    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number

    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number

}
