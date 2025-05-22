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
    ) {
    }

    async functionHandler(name: string, rawArguments: string, assistant: Assistant) {
        const tool = await this.aiToolsService.getToolByName(name, assistant.userId);
        if (!tool || !tool.webhook) {
            throw new HttpException('Tools webhook not found', HttpStatus.NOT_FOUND);
        }

        let parsedArgs: Record<string, any> = {};
        try {
            if (rawArguments) {
                parsedArgs = JSON.parse(rawArguments);
            }
        } catch (err) {
            throw new HttpException('Invalid function arguments format', HttpStatus.BAD_REQUEST);
        }

        console.log("PARAMS: ", parsedArgs)

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
            console.error('Webhook call failed:', axiosError.message);

            // Возвращаем текст ошибки вместо остановки
            return `Function call failed: ${axiosError.response?.status} ${axiosError.message}`
        }
    }
}
