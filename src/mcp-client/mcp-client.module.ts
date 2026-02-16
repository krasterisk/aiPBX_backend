import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { HttpModule } from '@nestjs/axios';

import { McpServer } from './models/mcp-server.model';
import { McpToolRegistry } from './models/mcp-tool-registry.model';
import { McpToolPolicy } from './models/mcp-tool-policy.model';
import { McpCallLog } from './models/mcp-call-log.model';
import { AssistantMcpServersModel } from './models/assistant-mcp-servers.model';

import { McpConnectionManagerService } from './services/mcp-connection-manager.service';
import { McpToolRegistryService } from './services/mcp-tool-registry.service';
import { McpPolicyService } from './services/mcp-policy.service';
import { McpClientService } from './services/mcp-client.service';
import { ToolGatewayService } from './services/tool-gateway.service';
import { McpCryptoService } from './services/mcp-crypto.service';
import { ComposioService } from './services/composio.service';
import { Bitrix24Service } from './services/bitrix24.service';
import { TelegramModule } from '../telegram/telegram.module';

import { McpClientController } from './mcp-client.controller';
import { AiToolsHandlersModule } from '../ai-tools-handlers/ai-tools-handlers.module';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../logger/logger.module';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        SequelizeModule.forFeature([
            McpServer,
            McpToolRegistry,
            McpToolPolicy,
            McpCallLog,
            AssistantMcpServersModel,
        ]),
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 3,
        }),
        AiToolsHandlersModule,
        AuthModule,
        LoggerModule,
        ConfigModule,
        TelegramModule,
    ],
    controllers: [McpClientController],
    providers: [
        McpConnectionManagerService,
        McpToolRegistryService,
        McpPolicyService,
        McpClientService,
        ToolGatewayService,
        McpCryptoService,
        ComposioService,
        Bitrix24Service,
    ],
    exports: [
        McpClientService,
        McpToolRegistryService,
        ToolGatewayService,
    ],
})
export class McpClientModule { }
