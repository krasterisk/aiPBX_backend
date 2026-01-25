import { BelongsToMany, Column, DataType, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { Role } from "../roles/roles.model";
import { UserRoles } from "../roles/user-roles.model";


interface UserCreationAttrs {
    email: string
    password: string
    vpbx_user_id: number
}

@Table({ tableName: 'users' })
export class User extends Model<User, UserCreationAttrs> {
    @ApiProperty({ example: 'Username', description: "Username. Required" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    username: string
    @ApiProperty({ example: 'Ivan', description: "User firstname" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    name: string
    @ApiProperty({ example: 'name@domain.com', description: "E-mail address" })
    @Column({ type: DataType.STRING, unique: true, allowNull: true })
    email: string
    @ApiProperty({ example: '0', description: "feature flag" })
    @Column({ type: DataType.BOOLEAN, unique: false, allowNull: true })
    designed: boolean
    @ApiProperty({ example: 'profile.png', description: "User avatar" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    avatar: string
    @ApiProperty({ example: '123', description: "GoogleId for google auth" })
    @Column({ type: DataType.STRING, unique: true, allowNull: true })
    googleId: string
    @ApiProperty({ example: '123', description: "TelegramId for Telegram auth" })
    @Column({ type: DataType.STRING, unique: true, allowNull: true })
    telegramId: number
    @ApiProperty({ example: '12345', description: "Password. Required" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    password: string
    @ApiProperty({ example: 'true', description: "Ban flag" })
    @Column({ type: DataType.BOOLEAN, unique: false, allowNull: true })
    banned: boolean
    @ApiProperty({ example: 'Bad behavior', description: "Ban reason" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    banReason: string
    @ApiProperty({ example: '40', description: "User balance" })
    @Column({ type: DataType.FLOAT, unique: false, allowNull: false, defaultValue: 0 })
    balance: number
    @ApiProperty({ example: 'USD', description: "Currency" })
    @Column({ type: DataType.STRING, unique: false, allowNull: false, defaultValue: 'USD' })
    currency: string
    @ApiProperty({ example: '123345', description: "Activation code" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    activationCode: string
    @ApiProperty({ example: '123345', description: "Activation expires timestamp" })
    @Column({ type: DataType.BIGINT, unique: false, allowNull: true })
    activationExpires: number
    @ApiProperty({ example: '12345-12312-12345-12345-123345', description: "Reset password link" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    resetPasswordLink: string
    @ApiProperty({ example: 'Google', description: "Type of user authorization" })
    @Column({ type: DataType.STRING, unique: false, allowNull: true })
    authType: string
    @ApiProperty({ example: 'true', description: "is activated user" })
    @Column({ type: DataType.BOOLEAN, unique: false, allowNull: false, defaultValue: false })
    isActivated: boolean

    @BelongsToMany(() => Role, () => UserRoles)
    roles: Role[]

    @ApiProperty({ example: '4', description: "VPBX cabinet id" })
    @Column({ type: DataType.INTEGER, unique: false, allowNull: true })
    vpbx_user_id: number
}
