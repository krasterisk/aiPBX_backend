import {forwardRef, Module} from '@nestjs/common';
import { CallbackController } from './callback.controller';
import {CallbackService} from "./callback.service";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Callback} from "./callback.model";

@Module({
  controllers: [CallbackController],
  providers: [CallbackService],
  imports: [
    SequelizeModule.forFeature([Callback]),
    forwardRef(() => AuthModule)
  ],
})
export class CallbackModule {}
