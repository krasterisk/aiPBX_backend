import {forwardRef, Module} from '@nestjs/common';
import { BlacklistController } from './blacklist.controller';
import { BlacklistService } from './blacklist.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Blacklist} from "./blacklist.model";

@Module({
  controllers: [BlacklistController],
  providers: [BlacklistService],
  imports: [
    SequelizeModule.forFeature([Blacklist]),
    forwardRef(() => AuthModule)
  ],
})
export class BlacklistModule {}
