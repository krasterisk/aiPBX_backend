import {BelongsTo, Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../users/users.model";

interface PostCreationAttrs {
    title: string
    content: string
    userId: number
    image: string
}

@Table({tableName: 'posts'})
export class Post extends Model<Post, PostCreationAttrs> {
    @ApiProperty({example: '1', description: "Уникальный идентификатор"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Заголовок', description: "Название поста"})
    @Column({type: DataType.STRING, allowNull: false})
    title: string
    @ApiProperty({example: 'Содержание', description: "Содержание поста"})
    @Column({type: DataType.STRING, unique: false, allowNull: false})
    content: string
    @ApiProperty({example: 'Изображение', description: "Ссылка на изображение"})
    @Column({type: DataType.STRING})
    image: string

    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number

    @BelongsTo(() => User)
    author: User

}