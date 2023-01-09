import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface ContextsCreationAttrs {
    name: string
    vpbx_user_id: number
}

@Table({tableName: 'custom_contexts'})
export class Context extends Model<Context, ContextsCreationAttrs> {
    @ApiProperty({example: '1', description: "Уникальный идентификатор"})
    @Column({type: DataType.INTEGER, unique: true, primaryKey: true, autoIncrement: true})
    id: number
    @ApiProperty({example: 'sip-out', description: "Наименование контектса"})
    @Column({type: DataType.STRING})
    name: string
    @ApiProperty({example: 'sip-out-mg,sip-out-city', description: "Список других контекстов, включенных в текущий"})
    @Column({type: DataType.STRING})
    includes: string
    @ApiProperty({example: 'Контекст для исходящих звонков', description: "Описание контекста"})
    @Column({type: DataType.STRING})
    description: string
}



