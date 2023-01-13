import {BelongsToMany, Column, DataType, HasMany, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Role} from "../roles/roles.model";
import {UserRoles} from "../roles/user-roles.model";
import {Endpoint} from "../pbx/endpoints/endpoints.model";
import {User} from "../users/users.model";

interface VpbxUserCreationAttrs {
    email: string
    password: string
}

@Table({tableName: 'vpbx_users'})
export class VpbxUser extends Model<VpbxUser, VpbxUserCreationAttrs> {
    @ApiProperty({example: '1', description: "Уникальный идентификатор"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'name@domain.com', description: "Е-мэйл пользователя. Обязательное поле"})
    @Column({type: DataType.STRING, unique: true, allowNull: false})
    email: string
    @ApiProperty({example: '12345', description: "Пароль"})
    @Column({type: DataType.STRING, unique: false, allowNull: false})
    password: string
    @ApiProperty({example: 'true', description: "Забанен или нет"})
    @Column({type: DataType.BOOLEAN, unique: false, allowNull: true})
    blocked: boolean
    @ApiProperty({example: 'Наказан', description: "Причина бана"})
    @Column({type: DataType.STRING, unique: false, allowNull: true})
    blockReason: string

}