import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Logs } from './logger.model';
import { LoggerService } from './logger.service';
import { LoggerController } from './logger.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        SequelizeModule.forFeature([Logs]),
        forwardRef(() => AuthModule),
    ],
    controllers: [LoggerController],
    providers: [LoggerService],
    exports: [LoggerService]
})
export class LoggerModule { }
