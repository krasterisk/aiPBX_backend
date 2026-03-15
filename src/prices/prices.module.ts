import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {PricesService} from "./prices.service";
import {PricesController} from "./prices.controller";
import {Prices} from "./prices.model";
import {UsersModule} from "../users/users.module";
import {CurrencyModule} from "../currency/currency.module";

@Module({
  providers: [PricesService],
  controllers: [PricesController],
  imports: [
    SequelizeModule.forFeature([Prices]),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    CurrencyModule,
  ],
  exports: [PricesService]
})
export class PricesModule {}
