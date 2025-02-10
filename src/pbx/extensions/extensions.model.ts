import {BelongsToMany, Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Route} from "../routes/routes.model";
import {RouteExtensions} from "./routes-extensions.model";

interface CreateExtensionAttr {
    exten: string
}

@Table({tableName: 'pbx_extensions'})
export class Extensions extends Model<Extensions, CreateExtensionAttr> {
    @ApiProperty({example: '1XX, [3-5]XN, X.', description: "Extension pattern"})
    @Column({type: DataType.STRING, allowNull: false})
    exten: string
    @Column({type: DataType.STRING, allowNull: true})
    callerId: string
    @BelongsToMany(() => Route, () => RouteExtensions)
    Routes: Route[]
}
