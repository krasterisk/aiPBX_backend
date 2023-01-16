import {forwardRef, Module} from '@nestjs/common';
import { RoutesService } from './routes.service';
import {RoutesController} from "./routes.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Route} from "./routes.model";
import {Extensions} from "../extensions/extensions.model";
import {ExtensionsModule} from "../extensions/extensions.module";
import {RouteExtensions} from "../extensions/routes-extensions.model";

@Module({
  providers: [RoutesService ],
  controllers: [RoutesController],
  imports: [
    SequelizeModule.forFeature([Route, Extensions, RouteExtensions]),
      ExtensionsModule,
    forwardRef(() => AuthModule),
  ],
  exports: [RoutesService],
})
export class RoutesModule {}
