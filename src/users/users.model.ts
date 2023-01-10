import {BelongsToMany, Column, DataType, HasMany, HasOne, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Role} from "../roles/roles.model";
import {UserRoles} from "../roles/user-roles.model";

interface UserCreationAttrs {
    email: string
    password: string
    vpbx_user_id: number
}

@Table({tableName: 'users'})
export class User extends Model<User, UserCreationAttrs> {
    @ApiProperty({example: '1', description: "Уникальный идентификатор"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'name@domain.com', description: "E-mail. Required"})
    @Column({type: DataType.STRING, unique: true, allowNull: false})
    email: string
    @ApiProperty({example: '12345', description: "Password. Required"})
    @Column({type: DataType.STRING, unique: false, allowNull: false})
    password: string
    @ApiProperty({example: 'true', description: "Ban flag"})
    @Column({type: DataType.BOOLEAN, unique: false, allowNull: true})
    banned: boolean
    @ApiProperty({example: 'Bad behavior', description: "Ban reason"})
    @Column({type: DataType.STRING, unique: false, allowNull: true})
    banReason: string

    @BelongsToMany(() => Role, () => UserRoles)
    roles: Role[]

    @ApiProperty({example: '4', description: "VPBX cabinet id"})
    @Column({type: DataType.INTEGER, unique: false, allowNull: false})
    vpbx_user_id: number
}