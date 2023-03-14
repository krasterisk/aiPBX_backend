import {Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {Text} from "./block-text.model";
import {BlockTextService} from "./block-text.service";

@Module({
    controllers: [],
    providers: [BlockTextService],
    imports: [
        SequelizeModule.forFeature([Text]),
    ],
    exports: [BlockTextService]
})

export class BlockTextModule {
}
