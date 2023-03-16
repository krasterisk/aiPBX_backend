import {Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {Text} from "./block-text.model";
import {BlockTextService} from "./block-text.service";
import { ParagraphService } from './paragraph/paragraph.service';
import { ParagraphModule } from './paragraph/paragraph.module';

@Module({
    controllers: [],
    providers: [BlockTextService],
    imports: [
        SequelizeModule.forFeature([Text]),
        ParagraphModule,
    ],
    exports: [BlockTextService]
})

export class BlockTextModule {
}
