import {Injectable, Logger} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Logs} from "./logger.model";
import {LogsDto} from "./dto/logs.dto";

@Injectable()
export class LoggerService {
    private readonly logger = new Logger(LoggerService.name);

    constructor(@InjectModel(Logs) private LogsRepository: typeof Logs) {}

    async create(log: LogsDto) {
        try {
            await this.LogsRepository.create(log)
            this.logger.log(`${log.event} from userId: ${log.userId}`)
        } catch (e) {
            this.logger.error(`Error logging event: ${log.event} from userId: ${log.userId}`)
        }
    }
}
