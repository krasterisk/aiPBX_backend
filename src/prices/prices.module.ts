import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {PricesService} from "./prices.service";
import {PricesController} from "./prices.controller";
import {Prices} from "./prices.model";

@Module({
  providers: [PricesService],
  controllers: [PricesController],
  imports: [
    SequelizeModule.forFeature([Prices]),
    forwardRef(() => AuthModule)
  ],
  exports: [PricesService]
})
export class PricesModule {}
