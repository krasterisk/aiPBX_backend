import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

interface CreateRates {
    currency: string,
    rate: number
}

@Table({ tableName: "rates" })
export class Rates extends Model<Rates, CreateRates> {
    @ApiProperty({example: 'USD', description: "Rate"})
    @Column({type: DataType.STRING, allowNull: false, unique: true})
    currency: string;
    @ApiProperty({example: '1', description: "Rate value"})
    @Column({type: DataType.FLOAT, allowNull: false})
    rate: number
}
