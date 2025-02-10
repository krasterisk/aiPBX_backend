import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'ps_aors', timestamps: false })
export class PsAor extends Model<PsAor> {
  @Column({ type: DataType.STRING })
  contact: string;
  @Column({ type: DataType.INTEGER })
  default_expiration: number;
  @Column({ type: DataType.STRING })
  mailboxes: string;
  @Column({ type: DataType.INTEGER })
  max_contacts: number;
  @Column({ type: DataType.INTEGER })
  minimum_expiration: number;
  @Column({ type: DataType.ENUM('yes', 'no') })
  remove_existing: string;
  @Column({ type: DataType.INTEGER })
  qualify_frequency: number;
  @Column({ type: DataType.ENUM('yes', 'no') })
  authenticate_qualify: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  support_path: string;
}
