import {forwardRef, Module} from '@nestjs/common';
import { ContextsService } from './contexts.service';
import { ContextsController } from './contexts.controller';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Context} from "./contexts.model";

@Module({
  providers: [ContextsService],
  controllers: [ContextsController],
  imports: [
    SequelizeModule.forFeature([Context]),
    forwardRef(() => AuthModule)
  ],

})
export class ContextsModule {}
