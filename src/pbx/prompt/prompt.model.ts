import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsString} from "class-validator";

export class PromptFileName {
    @IsNotEmpty({message: "Must be filename"})
    @IsString({message: "Must be a string"})
    filename: string
    @IsNotEmpty({message: "Must be extensions"})
    @IsString({message: "Must be a string"})
    extension: string
}

interface CreatePromptModelAttr {
    name: string
    filenames: PromptFileName[]
    vpbx_user_id: number
}

@Table({tableName: "pbx_prompts"})
export class Prompt extends Model<Prompt, CreatePromptModelAttr> {
    @ApiProperty({example: 'Permit for 100', description: "Permit name"})
    @Column({type: DataType.STRING, allowNull: false})
    name: string
    @ApiProperty({example: 'main.mp3', description: "filename"})
    @Column({type: DataType.JSON, allowNull: false})
    filenames: PromptFileName[]
    @ApiProperty({example: 'holidays', description: "MOH classname"})
    @Column({type: DataType.STRING, allowNull: true})
    classmoh: string
    @ApiProperty({example: 'Holidays records', description: "Comment"})
    @Column({type: DataType.STRING, allowNull: true})
    comment: string
    @ApiProperty({example: '1', description: "VPBX user id"})
    @Column({type: DataType.INTEGER, allowNull: false})
    vpbx_user_id: number
}

