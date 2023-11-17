import { Column, DataType, Model, Table } from "sequelize-typescript"
import { ApiProperty } from "@nestjs/swagger"
import { EndpointGroupsDto } from "./dto/endpoint-groups.dto"

interface EndpointGroupsCreationAttrs {
  endpoint_id: string
  username: string
  password: string
  vpbx_user_id: number
}

@Table({ tableName: "pbx_endpoints_groups" })
export class EndpointGroups extends Model<EndpointGroupsDto, EndpointGroupsCreationAttrs> {
  @Column({
    type: DataType.INTEGER,
    unique: true,
    primaryKey: true,
    autoIncrement: true,
  })
  id: number;
  @ApiProperty({ example: "Support", description: "Endpoint groups name" })
  @Column({ type: DataType.STRING })
  name: string
  @ApiProperty({
    example: "My lovely group",
    description: "Endpoint groups description",
  })
  @Column({ type: DataType.STRING })
  description: string
  @ApiProperty({ example: "4", description: "VPBX user id" })
  @Column({ type: DataType.INTEGER, allowNull: false })
  vpbx_user_id: number
}
