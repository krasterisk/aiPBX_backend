import { Module } from '@nestjs/common';
import {CurrencyService} from "./currency.service";
import {SequelizeModule} from "@nestjs/sequelize";
import {Rates} from "./rates.model";
import { CurrencyController } from './currency.controller';
import {CurrencyTask} from "./currency.task";

@Module({
    imports: [SequelizeModule.forFeature([Rates])],
    providers: [CurrencyService, CurrencyTask],
    exports: [CurrencyService],
    controllers: [CurrencyController]
})
export class CurrencyModule {}
