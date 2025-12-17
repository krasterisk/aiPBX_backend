import {HttpException, HttpStatus, Inject, Injectable, Logger} from '@nestjs/common';
import {Assistant} from "../assistants/assistants.model";
import {AiToolsService} from "../ai-tools/ai-tools.service";
import {HttpService} from "@nestjs/axios";
import {firstValueFrom} from "rxjs";
import {AxiosError} from "axios";

@Injectable()
export class AiToolsHandlersService {

    private readonly logger = new Logger(AiToolsHandlersService.name);

    constructor(
        @Inject(AiToolsService) private readonly aiToolsService: AiToolsService,
        private readonly httpService: HttpService
    ) {}

    async functionHandler(name: string, rawArguments: string, assistant: Assistant) {
        const tool = await this.aiToolsService.getToolByName(name, assistant.userId);
        if (!tool || !tool.webhook) {
            return `Function call failed: tool not found, try again later`
        }

        let parsedArgs: Record<string, any> = {};
        try {
            if (rawArguments) {
                parsedArgs = JSON.parse(rawArguments);
            }
        } catch (err) {
            return 'Invalid function arguments format';
        }
        this.logger.log(`Webhook detected: ${tool.webhook}`,JSON.stringify(parsedArgs));
        try {
            const response = await firstValueFrom(
                this.httpService.get(tool.webhook, {
                    headers: {'Content-Type': 'application/json;charset=utf-8'},
                    params: parsedArgs,
                })
            );

            // Вернём data как string или сериализованный объект
            return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        } catch (error) {
            // Логируем, но не прерываем выполнение
            const axiosError = error as AxiosError;
            this.logger.error(`Webhook ${tool.webhook} call failed:`,
                `${axiosError.response?.status}, 
                ${axiosError.response?.statusText},
                ${JSON.stringify(axiosError.response?.data)},
                ${axiosError.message},
                ${axiosError.status},
                ${axiosError.toString()}`);

            // Возвращаем текст ошибки вместо остановки
            return `Function call failed: ${axiosError.response?.status} ${JSON.stringify(axiosError.response?.data)}`
        }
    }
}
