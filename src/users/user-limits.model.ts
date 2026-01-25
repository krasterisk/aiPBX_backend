import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { User } from "./users.model";
import { ApiProperty } from "@nestjs/swagger";

interface UserLimitsCreationAttrs {
    userId: number;
    limitAmount: number;
    emails: string[];
}

@Table({ tableName: 'user_limits' })
export class UserLimits extends Model<UserLimits, UserLimitsCreationAttrs> {
    @ApiProperty({ example: '1', description: "User ID" })
    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, unique: true, allowNull: false })
    userId: number;

    @BelongsTo(() => User)
    user: User;

    @ApiProperty({ example: '100', description: "Limit amount in currency" })
    @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
    limitAmount: number;

    @ApiProperty({ example: '["test@test.com"]', description: "Notification emails" })
    @Column({ type: DataType.JSON, allowNull: false, defaultValue: [] })
    emails: string[];
}
