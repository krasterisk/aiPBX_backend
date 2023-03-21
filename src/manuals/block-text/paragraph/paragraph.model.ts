import {BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";
import {Text} from "../block-text.model";

interface ParagraphCreationAttrs {
    paragraph: string
}

@Table({tableName: 'post_text_paragraphs'})
export class Paragraph extends Model<Paragraph, ParagraphCreationAttrs> {
    @ApiProperty({example: '1', description: "Paragraph id"})
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number
    @ApiProperty({example: 'Some text paragraph', description: "Paragraph string"})
    @Column({type: DataType.TEXT, allowNull: false})
    paragraph: string
    @ForeignKey(() => Text)
    @Column({type: DataType.INTEGER})
    blockTextId: number
    @BelongsTo(() => Text)
    blockText: Text

}
