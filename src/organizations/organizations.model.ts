import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "../users/users.model";

interface OrganizationCreationAttrs {
    userId: number;
    name: string;
    tin: string;
    address: string;
}

@Table({ tableName: 'organizations' })
export class Organization extends Model<Organization, OrganizationCreationAttrs> {

    @ApiProperty({ example: 1, description: "User ID" })
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    userId: number;

    @ApiProperty({ example: 'My Corp', description: "Organization Name" })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: '1234567890', description: "Tax Identification Number (TIN/INN)" })
    @Column({ type: DataType.STRING, allowNull: false })
    tin: string;

    @ApiProperty({ example: '123 Main St', description: "Address" })
    @Column({ type: DataType.STRING, allowNull: false })
    address: string;

    @BelongsTo(() => User)
    user: User;
}
