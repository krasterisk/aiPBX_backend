import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";

interface CreatePrice {
    userId: number;
    realtime: number;
    analytic: number;
}

@Table({ tableName: "prices" })
export class Prices extends Model<Prices, CreatePrice> {
    @ApiProperty({ example: '123', description: "Realtime Price" })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    realtime: number

    @ApiProperty({ example: '123', description: "Analytic Price" })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    analytic: number
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, unique: true })
    userId: number
    @BelongsTo(() => User)
    user: User

}
