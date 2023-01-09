import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface EndpointCreationAttrs {
    endpoint_id: string
    username: string
    password: string
    vpbx_user_id: number
}

@Table({tableName: 'endpoints'})
export class Endpoint extends Model<Endpoint, EndpointCreationAttrs> {
    @Column({type: DataType.INTEGER, unique: true, primaryKey: true, autoIncrement: true})
    id: number
    @ApiProperty({example: 'WorkSoftPhone', description: "Наименование устройства"})
    @Column({type: DataType.STRING, unique: true})
    endpoint_id: string
    @ApiProperty({example: 'WorkSoftPhone', description: "Имя пользователя"})
    @Column({type: DataType.STRING})
    username: string
    @ApiProperty({example: 'WorkSoftPhone', description: "Пароль"})
    @Column({type: DataType.STRING})
    password: string
    @ApiProperty({example: 'sip-out', description: "Контекст вызовов"})
    @Column({type: DataType.STRING, allowNull: false})
    context: string
    @ApiProperty({example: 'transport-udp', description: "Используемый транспорт"})
    @Column({type: DataType.STRING, allowNull: false})
    transport: string
    @ApiProperty({example: 'allow', description: "Используемые кодеки"})
    @Column({type: DataType.STRING, allowNull: false})
    allow: string
    @ApiProperty({example: '2', description: "Ограничение на количество регистраций"})
    @Column({type: DataType.INTEGER})
    max_contacts: number
    @ApiProperty({example: 'md5,userpass,google_oauth', description: "Тип авторизации"})
    @Column({type: DataType.STRING})
    auth_type: string
    @ApiProperty({example: '4', description: "Идентификатор кабинета ВАТС"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}