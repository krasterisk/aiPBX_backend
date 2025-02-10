import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'ps_auths', timestamps: false })
export class PsAuth extends Model<PsAuth> {

  @Column({ type: DataType.ENUM('md5', 'userpass') })
  auth_type: string;

  @Column({ type: DataType.INTEGER })
  nonce_lifetime: number;

  @Column({ type: DataType.STRING })
  md5_cred: string;

  @Column({ type: DataType.STRING })
  password: string;

  @Column({ type: DataType.STRING })
  realm: string;

  @Column({ type: DataType.STRING })
  username: string;
}
