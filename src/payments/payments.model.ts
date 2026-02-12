import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ApiProperty } from "@nestjs/swagger";

interface CreatePayment {
    userId: string
    amount: number
    stripePaymentIntentId?: string
    currency?: string
    status?: string
    paymentMethod?: string
    receiptUrl?: string
}

@Table({ tableName: "payments" })
export class Payments extends Model<Payments, CreatePayment> {
    @ApiProperty({ example: '123', description: "User id" })
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;
    @ApiProperty({ example: '1000', description: "amount" })
    @Column({ type: DataType.FLOAT, allowNull: false })
    amount: number
    @ApiProperty({ example: 'OK', description: "Transaction status" })
    @Column({ type: DataType.STRING, allowNull: true })
    status: string
    @ApiProperty({ example: 'bank', description: "Payment Method" })
    @Column({ type: DataType.STRING, allowNull: true })
    paymentMethod: string
    @ApiProperty({ example: 'BankCardAE', description: "Payment Info, Label, etc" })
    @Column({ type: DataType.STRING, allowNull: true })
    paymentInfo: string
    @ApiProperty({ example: '10', description: "Payment system id" })
    @Column({ type: DataType.INTEGER, allowNull: true })
    payId: number
    @ApiProperty({ example: '1006', description: "vPbxUserId" })
    @Column({ type: DataType.STRING, allowNull: true })
    vPbxUserId: string

    @ApiProperty({ example: 'pi_3MtwPdLkdIwHu7ix28a3tqPa', description: "Stripe Payment Intent ID" })
    @Column({ type: DataType.STRING, allowNull: true })
    stripePaymentIntentId: string;

    @ApiProperty({ example: 'usd', description: "Currency" })
    @Column({ type: DataType.STRING, allowNull: true })
    currency: string;

    @ApiProperty({ example: 'https://pay.stripe.com/receipts/...', description: "Stripe receipt URL" })
    @Column({ type: DataType.STRING, allowNull: true })
    receiptUrl: string;
}
