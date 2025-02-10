import {BelongsToMany, Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {RouteExtensions} from "../extensions/routes-extensions.model";
import {Extensions} from "../extensions/extensions.model";


interface CreateRouteAttr {
    id: number
    name: string
    vpbx_user_id: number

}

@Table({tableName: 'pbx_routes'})
export class Route extends Model<Route, CreateRouteAttr> {
    @ApiProperty({example: 'true', description: "Disable/Enable PBX route"})
    @Column({type: DataType.BOOLEAN, defaultValue: true})
    active: boolean
    @ApiProperty({example: 'City routes', description: "Route name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string

    @BelongsToMany(() => Extensions, () => RouteExtensions)
    extensions: Extensions[]

    @ApiProperty({example: 'Outbound_routes', description: "Context"})
    @Column({type: DataType.INTEGER, allowNull: true, defaultValue: 0})
    context_id: number
    @ApiProperty({example: 'Records', description: "Records options template"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    records_id: number
    @ApiProperty({example: 'Permits', description: "Permits options template"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    permits_id: number
    @ApiProperty({example: 'listbook', description: "Check listbook"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    listbook_id: number
    @ApiProperty({example: 'blacklist', description: "Check blacklist"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    blacklist_id: number
    @ApiProperty({example: 'callback', description: "Check callback list"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    callback_id: number
    @ApiProperty({example: 'webhooks', description: "Webhooks list"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    webhook_id: number
    @ApiProperty({example: 'apps', description: "apps list id"})
    @Column({type: DataType.INTEGER, defaultValue: 0})
    apps_id: number
    @ApiProperty({example: '1', description: "VPBX cabinet id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number

}
