import {forwardRef, Module} from '@nestjs/common';
import { RecordsService } from './records.service';
import {RecordsController} from "./records.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Record} from "./record.model";

@Module({
  providers: [RecordsService],
  controllers: [RecordsController],
  imports: [
    SequelizeModule.forFeature([Record]),
    forwardRef(() => AuthModule)
  ],
})
export class RecordsModule {}
