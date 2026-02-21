import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface OperatorProjectCreationAttrs {
    name: string;
    userId: string;
    description?: string;
}

@Table({ tableName: 'operator_projects' })
export class OperatorProject extends Model<OperatorProject, OperatorProjectCreationAttrs> {

    @ApiProperty({ example: 1 })
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    id: number;

    @ApiProperty({ example: 'Отдел продаж' })
    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @ApiProperty({ example: 'Входящие звонки менеджеров продаж' })
    @Column({ type: DataType.TEXT, allowNull: true })
    description: string;

    @ApiProperty({ example: '5' })
    @Column({ type: DataType.STRING, allowNull: false })
    userId: string;
}
