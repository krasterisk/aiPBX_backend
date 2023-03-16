import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {Role} from "../../roles/roles.model";
import {User} from "../../users/users.model";

@Table({tableName: 'user_roles', createdAt: false, updatedAt: false})
export class PostsBlocks extends Model<PostsBlocks> {
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ForeignKey(() => Role)
    @Column({type: DataType.INTEGER})
    postId: number
    @ForeignKey(() => User)
    @Column({type: DataType.STRING})
    blockId: number
}
