import {forwardRef, Module} from '@nestjs/common';
import { RoutesService } from './routes.service';
import {RoutesController} from "./routes.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Route} from "./routes.model";

@Module({
  providers: [RoutesService],
  controllers: [RoutesController],
  imports: [
    SequelizeModule.forFeature([Route]),
    forwardRef(() => AuthModule)
  ],
})
export class RoutesModule {}
