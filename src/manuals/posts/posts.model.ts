import {
    BelongsTo,
    Column,
    DataType,
    ForeignKey, HasMany,
    Model,
    Table
} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../../users/users.model";
import {ManualHashtags} from "./dto/create-post.dto";

interface PostCreationAttrs {
    title: string
}

@Table({tableName: 'posts'})
export class Post extends Model<Post, PostCreationAttrs> {
    @ApiProperty({example: '1', description: "Post id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Title', description: "Post Title"})
    @Column({type: DataType.STRING, allowNull: false})
    title: string
    @ApiProperty({example: 'Subtitle', description: "Post Subtitle"})
    @Column({type: DataType.STRING, allowNull: false})
    subtitle: string
    @ApiProperty({example: 'Image', description: "Image link"})
    @Column({type: DataType.STRING})
    image: string
    @ApiProperty({example: 'Hashtag', description: "Post hashtag"})
    @Column({type: DataType.STRING})
    hashtags: ManualHashtags[]
    @ApiProperty({example: 'Subtitle', description: "Post Subtitle"})
    @Column({type: DataType.INTEGER})
    views: number
    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number

    @BelongsTo(() => User)
    author: User

}
