import {Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {Route} from "../routes/routes.model";
import {Extensions} from "./extensions.model";

@Table({tableName: 'pbx_routes_extensions', createdAt: false, updatedAt: false})
export class RouteExtensions extends Model<RouteExtensions> {
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ForeignKey(() => Route)
    @Column({type: DataType.INTEGER})
    routeId: number
    @ForeignKey(() => Extensions)
    @Column({type: DataType.INTEGER})
    extensionId: number
}

