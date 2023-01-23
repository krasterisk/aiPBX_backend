import {forwardRef, Module} from '@nestjs/common';
import { IvrService } from './ivr.service';
import {IvrController} from "./ivr.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Ivr} from "./ivr.model";

@Module({
  providers: [IvrService],
  controllers: [IvrController],
  imports: [
    SequelizeModule.forFeature([Ivr]),
    forwardRef(() => AuthModule)
  ],
})
export class IvrModule {}
