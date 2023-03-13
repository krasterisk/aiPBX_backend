import {BelongsToMany, Column, DataType, HasMany, HasOne, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Role} from "../roles/roles.model";
import {UserRoles} from "../roles/user-roles.model";

interface UserCreationAttrs {
    email: string
    username: string
    password: string
    vpbx_user_id: number
}

@Table({tableName: 'users'})
export class User extends Model<User, UserCreationAttrs> {
    @ApiProperty({example: '1', description: "Unique id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Username', description: "Username. Required"})
    @Column({type: DataType.STRING, unique: true, allowNull: false})
    username: string
    @ApiProperty({example: 'Ivan', description: "User firstname"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    firstname: string
    @ApiProperty({example: 'Ivanov', description: "User lastname"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    lastname: string
    @ApiProperty({example: '22', description: "User Age"})
    @Column({type: DataType.INTEGER, unique: true, allowNull: true})
    age: number
    @ApiProperty({example: 'Russia', description: "User Country"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    country: number
    @ApiProperty({example: 'name@domain.com', description: "E-mail address"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    email: string
    @ApiProperty({example: 'RUB', description: "User currency"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    currency: string
    @ApiProperty({example: 'profile.png', description: "User avatar"})
    @Column({type: DataType.STRING, unique: true, allowNull: true})
    avatar: string
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
