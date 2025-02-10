import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateAppAttr {
    name: string
    filename: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_apps"})
export class App extends Model<App, CreateAppAttr> {
    @ApiProperty({example: 'voice-mail', description: "Voice mail"})
    @Column({type: DataType.STRING, unique: true, allowNull: false})
    name: string
    @ApiProperty({example: 'voice_mail.conf', description: "filename"})
    @Column({type: DataType.STRING})
    filename: string
    @ApiProperty({example: '4', description: "VPBX user id"})
    @Column({type: DataType.INTEGER})
    vpbx_user_id: number
}
