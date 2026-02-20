import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Logs } from "./logger.model";
import { LogsDto } from "./dto/logs.dto";
import { GetLogsDto } from "./dto/get-logs.dto";
import sequelize, { Op } from "sequelize";

@Injectable()
export class LoggerService {
    private readonly logger = new Logger(LoggerService.name);
    private readonly dialect: string;

    constructor(@InjectModel(Logs) private LogsRepository: typeof Logs) {
        this.dialect = this.LogsRepository.sequelize.getDialect();
    }

    private sqlDate(col: string): string {
        return this.dialect === 'postgres' ? `${col}::date` : `DATE(${col})`;
    }

    /**
     * Create a log entry directly from DTO
     */
    async create(log: LogsDto) {
        try {
            await this.LogsRepository.create(log as any);
            this.logger.log(`[${log.action}] ${log.entity || ''}${log.entityId ? '#' + log.entityId : ''}: ${log.event} (userId: ${log.userId})`);
        } catch (e) {
            this.logger.error(`Error logging event: ${log.event} from userId: ${log.userId}`, e.message);
        }
    }

    /**
     * Convenient helper for controllers to log user actions
     */
    async logAction(
        userId: number,
        action: string,
        entity: string,
        entityId: number | null,
        event: string,
        oldData?: any,
        newData?: any,
        req?: any,
    ) {
        try {
            await this.LogsRepository.create({
                userId,
                action,
                entity,
                entityId,
                event,
                oldData: oldData || null,
                newData: newData || null,
                ipAddress: req?.ip || req?.connection?.remoteAddress || null,
                userAgent: req?.headers?.['user-agent'] || null,
            } as any);
        } catch (e) {
            this.logger.error(`Error logging action: ${action} ${entity} (userId: ${userId})`, e.message);
        }
    }

    /**
     * Paginated logs with search and filters
     */
    async get(query: GetLogsDto, isAdmin: boolean, userId: string) {
        try {
            const page = Number(query.page) || 1;
            const limit = Number(query.limit) || 25;
            const offset = (page - 1) * limit;
            const search = query.search || '';

            const effectiveUserId = !isAdmin ? Number(userId) : Number(query.userId) || undefined;

            if (!userId && !isAdmin) {
                throw new HttpException({ message: 'Request error' }, HttpStatus.BAD_REQUEST);
            }

            const whereClause: any = {};

            // Search across event text and entity
            if (search) {
                whereClause[Op.or] = [
                    { event: { [Op.like]: `%${search}%` } },
                    { entity: { [Op.like]: `%${search}%` } },
                    { ipAddress: { [Op.like]: `%${search}%` } },
                ];
            }

            if (effectiveUserId !== undefined) {
                whereClause.userId = effectiveUserId;
            }

            // Filter by action
            if (query.action) {
                whereClause.action = query.action;
            }

            // Filter by entity
            if (query.entity) {
                whereClause.entity = query.entity;
            }

            // Date range filter
            if (query.startDate && query.endDate) {
                whereClause.createdAt = {
                    [Op.between]: [query.startDate + ' 00:00', query.endDate + ' 23:59'],
                };
            } else if (query.startDate) {
                whereClause.createdAt = {
                    [Op.gte]: sequelize.literal(this.sqlDate(`'${query.startDate}'`)),
                };
            } else if (query.endDate) {
                whereClause.createdAt = {
                    [Op.lte]: sequelize.literal(this.sqlDate(`'${query.endDate}'`)),
                };
            }

            return await this.LogsRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                where: whereClause,
                order: [['createdAt', 'DESC']],
                include: [{
                    all: true,
                    attributes: {
                        exclude: ['password', 'activationCode', 'resetPasswordLink', 'googleId', 'telegramId', 'activationExpires', 'isActivated', 'vpbx_user_id']
                    }
                }],
            });
        } catch (e) {
            throw new HttpException({ message: '[Logs]: Request error' } + e, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * All logs (no pagination)
     */
    async getAll(isAdmin: boolean, userId: string) {
        try {
            if (!userId && !isAdmin) {
                throw new HttpException({ message: '[Logs]: userId must be set' }, HttpStatus.BAD_REQUEST);
            }

            const effectiveUserId = isAdmin ? undefined : Number(userId);
            const whereClause: any = effectiveUserId ? { userId: effectiveUserId } : {};

            return await this.LogsRepository.findAll({
                where: whereClause,
                order: [['createdAt', 'DESC']],
                include: [{
                    all: true,
                    attributes: {
                        exclude: ['password', 'activationCode', 'resetPasswordLink', 'googleId', 'telegramId', 'activationExpires', 'isActivated', 'vpbx_user_id']
                    }
                }],
            });
        } catch (e) {
            throw new HttpException({ message: '[Logs]: Request error' } + e, HttpStatus.BAD_REQUEST);
        }
    }
}
