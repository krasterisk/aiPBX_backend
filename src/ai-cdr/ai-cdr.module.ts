import {forwardRef, Module} from '@nestjs/common';
import { AiCdrController } from './ai-cdr.controller';
import {AiCdrService} from "./ai-cdr.service";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {AiCdr} from "./ai-cdr.model";
import {AiEvents} from "./ai-events.model";

@Module({
  controllers: [AiCdrController],
  providers: [AiCdrService],
  imports: [
    SequelizeModule.forFeature([AiCdr, AiEvents]),
    forwardRef(() => AuthModule)
  ],
  exports: [AiCdrService],
})
export class AiCdrModule {}
