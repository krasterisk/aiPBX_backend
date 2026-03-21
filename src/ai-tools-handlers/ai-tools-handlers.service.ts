import { Inject, Injectable, Logger } from '@nestjs/common';
import { Assistant } from "../assistants/assistants.model";
import { AiToolsService } from "../ai-tools/ai-tools.service";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import { KnowledgeService } from "../knowledge/knowledge.service";

@Injectable()
export class AiToolsHandlersService {

    private readonly logger = new Logger(AiToolsHandlersService.name);

    constructor(
        @Inject(AiToolsService) private readonly aiToolsService: AiToolsService,
        private readonly httpService: HttpService,
        private readonly knowledgeService: KnowledgeService,
    ) { }

    async functionHandler(name: string, rawArguments: string, assistant: Assistant) {
        const tool = await this.aiToolsService.getToolByName(name, assistant.userId);
        if (!tool) {
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

        // ── Knowledge Base Handler ──
        const toolData = typeof tool.toolData === 'string' ? JSON.parse(tool.toolData) : tool.toolData;
        if (toolData?.handler === 'knowledge_base') {
            return this.handleKnowledgeBaseSearch(toolData, parsedArgs);
        }

        // ── Webhook Handler (existing) ──
        if (!tool.webhook) {
            return `Function call failed: no webhook configured for tool "${name}"`;
        }

        this.logger.log(`Webhook detected: ${tool.webhook} [${tool.method || 'GET'}]`, JSON.stringify(parsedArgs));
        try {
            const method = (tool.method || 'GET').toUpperCase();
            const config = {
                headers: {
                    'Content-Type': 'application/json;charset=utf-8',
                    ...(tool.headers || {})
                },
            };

            const response = await firstValueFrom(
                method === 'POST'
                    ? this.httpService.post(tool.webhook, parsedArgs, config)
                    : this.httpService.get(tool.webhook, { ...config, params: parsedArgs })
            );

            return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        } catch (error) {
            const axiosError = error as AxiosError;
            this.logger.error(`Webhook ${tool.webhook} call failed:`,
                `${axiosError.response?.status}, 
                ${axiosError.response?.statusText},
                ${JSON.stringify(axiosError.response?.data)},
                ${axiosError.message},
                ${axiosError.status},
                ${axiosError.toString()}`);

            return `Function call failed: ${axiosError.response?.status} ${JSON.stringify(axiosError.response?.data)}`
        }
    }

    /**
     * Handle knowledge base search tool call.
     * Searches across specified knowledge bases and returns relevant chunks.
     */
    private async handleKnowledgeBaseSearch(
        toolData: { knowledgeBaseIds?: number[] },
        args: { query?: string },
    ): Promise<string> {
        const kbIds = toolData.knowledgeBaseIds || [];
        const query = args.query || '';

        if (!query) {
            return 'Error: query parameter is required';
        }
        if (!kbIds.length) {
            return 'No knowledge bases configured for this tool';
        }

        try {
            const results = await this.knowledgeService.searchMultiple(kbIds, query, 5);

            if (results.length === 0) {
                return 'No relevant information found in the knowledge base.';
            }

            // Format results for the LLM
            const formatted = results
                .filter(r => r.similarity > 0.3)
                .map((r, i) => `[${i + 1}] (relevance: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`)
                .join('\n---\n');

            return formatted || 'No relevant information found in the knowledge base.';
        } catch (err) {
            this.logger.error(`Knowledge base search failed: ${err.message}`);
            return `Knowledge base search error: ${err.message}`;
        }
    }
}
