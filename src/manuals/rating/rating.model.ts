import {BelongsTo, Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Post} from "../posts/posts.model";
import {User} from "../../users/users.model";

interface RatingCreationsAttrs {
    rate: number
    postId: number
    userId: number
}

@Table({tableName: 'post_rating'})
export class Rating extends Model<Rating, RatingCreationsAttrs> {
    @ApiProperty({example: '1', description: "Rating id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: '4', description: "Rating"})
    @Column({type: DataType.INTEGER})
    rate: number
    @ApiProperty({example: 'Good manual', description: "Rating feedback"})
    @Column({type: DataType.STRING})
    feedback: string
    @ForeignKey(() => Post)
    @Column({type: DataType.INTEGER})
    postId: number
    @BelongsTo(() => Post)
    post: Post
    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number
    @BelongsTo(() => User)
    user: User
}
