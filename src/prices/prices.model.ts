import {BelongsTo, Column, DataType, ForeignKey, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "../users/users.model";

interface CreatePrice {
    userId: string
    summa: number
}

@Table({ tableName: "prices" })
export class Prices extends Model<Prices, CreatePrice> {
    @ApiProperty({example: '123', description: "Price"})
    @Column({type: DataType.FLOAT, allowNull: false, defaultValue: 0})
    price: number;
    @ForeignKey(() => User)
    @Column({type: DataType.INTEGER})
    userId: number
    @BelongsTo(() => User)
    user: User

}
