import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

export interface CreateWebhookAttr {
    name: string,
    url: string,
    events: string,
    vpbx_user_id: number
}

@Table({tableName: "pbx_webhooks"})
export class Webhook extends Model<Webhook, CreateWebhookAttr> {
    @ApiProperty({example: 'On Answer webhook', description: "Webhook name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'OnAnswer', description: "Webhook events"})
    @Column({type: DataType.STRING, allowNull: false})
    events: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.STRING, allowNull: false})
    vpbx_user_id: number
}

