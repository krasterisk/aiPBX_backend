import {forwardRef, Module} from '@nestjs/common';
import {EndpointsService} from "./endpoints.service";
import {EndpointsController} from "./endpoints.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {Endpoint} from "./endpoints.model";
import {AuthModule} from "../../auth/auth.module";

@Module({
    providers: [EndpointsService],
    controllers: [EndpointsController],
    imports: [
        SequelizeModule.forFeature([Endpoint]),
        forwardRef(() => AuthModule)
    ],
    exports: [
        EndpointsService
    ]
})
export class EndpointsModule {}

