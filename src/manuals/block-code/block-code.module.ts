import {Module} from '@nestjs/common';
import {BlockCodeService} from './block-code.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {Code} from "./block-code.model";

@Module({
  controllers: [],
  providers: [BlockCodeService],
  imports: [
    SequelizeModule.forFeature([Code]),
  ],
  exports: [BlockCodeService]
})
export class BlockCodeModule {}
