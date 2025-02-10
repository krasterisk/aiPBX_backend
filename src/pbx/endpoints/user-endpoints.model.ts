import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {User} from "../../users/users.model";
import {Endpoint} from "./endpoints.model";


@Table({tableName: 'user_endpoints', createdAt: false, updatedAt: false})
export class UserEndpoints extends Model<UserEndpoints> {
    @ForeignKey(() => Endpoint)
    @Column({type: DataType.STRING})
    endpoint_id: string
    @ForeignKey(() => User)
    @Column({type: DataType.STRING})
    userId: number
}
