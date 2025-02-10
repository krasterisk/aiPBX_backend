import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsString} from "class-validator";

export class CreateProvisioningModelAttr {
    @IsString({message: "Must be a string"})
    vendor: string
    @IsNotEmpty({message: "Must be filename"})
    @IsString({message: "Must be a string"})
    filename: string
    description: string
    vpbx_user_id: number
}

@Table({tableName: "pbx_provisioning"})
export class Provisioning extends Model<Provisioning, CreateProvisioningModelAttr> {
    @ApiProperty({example: 'SuperVendor', description: "Vendor name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'vendor.cfg', description: "template file for vendor"})
    @Column({type: DataType.STRING, allowNull: false})
    filename: string
    @ApiProperty({example: 'only for model x22', description: "template description"})
    @Column({type: DataType.STRING, allowNull: true})
    description: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}

