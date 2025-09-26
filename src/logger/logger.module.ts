import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Logs } from './logger.model';
import { LoggerService } from './logger.service';

@Module({
    imports: [SequelizeModule.forFeature([Logs])],
    providers: [LoggerService],
    exports: [LoggerService]
})
export class LoggerModule {}
