import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Predefined Bitrix24 CRM tools that are useful for a voice bot.
 * Each tool maps to a Bitrix24 REST API method.
 */
export const BITRIX24_TOOLS: Array<{
    slug: string;
    name: string;
    description: string;
    method: string;
    inputSchema: Record<string, any>;
}> = [
        // ─── CRM: Leads ──────────────────────────────────────────────────
        {
            slug: 'BITRIX24_CRM_LEAD_ADD',
            name: 'Create Lead',
            description: 'Create a new lead in Bitrix24 CRM. Use to capture potential customers during a call.',
            method: 'crm.lead.add',
            inputSchema: {
                type: 'object',
                properties: {
                    TITLE: { type: 'string', description: 'Lead title (e.g. "Interest in product X")' },
                    NAME: { type: 'string', description: 'Contact first name' },
                    LAST_NAME: { type: 'string', description: 'Contact last name' },
                    PHONE: {
                        type: 'array',
                        description: 'Phone numbers',
                        items: {
                            type: 'object',
                            properties: {
                                VALUE: { type: 'string', description: 'Phone number' },
                                VALUE_TYPE: { type: 'string', enum: ['WORK', 'MOBILE', 'HOME'], default: 'MOBILE' },
                            },
                        },
                    },
                    EMAIL: {
                        type: 'array',
                        description: 'Email addresses',
                        items: {
                            type: 'object',
                            properties: {
                                VALUE: { type: 'string', description: 'Email address' },
                                VALUE_TYPE: { type: 'string', enum: ['WORK', 'HOME'], default: 'WORK' },
                            },
                        },
                    },
                    COMMENTS: { type: 'string', description: 'Additional notes or comments about the lead' },
                    SOURCE_DESCRIPTION: { type: 'string', description: 'How the lead was acquired (e.g. "Phone call via AI PBX")' },
                },
                required: ['TITLE'],
            },
        },
        {
            slug: 'BITRIX24_CRM_LEAD_LIST',
            name: 'Search Leads',
            description: 'Search leads in Bitrix24 CRM by phone, name or title.',
            method: 'crm.lead.list',
            inputSchema: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'object',
                        description: 'Filter criteria, e.g. { "PHONE": "+79001234567" } or { "%TITLE": "keyword" }',
                    },
                    select: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Fields to return',
                        default: ['ID', 'TITLE', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL', 'STATUS_ID'],
                    },
                },
            },
        },

        // ─── CRM: Contacts ───────────────────────────────────────────────
        {
            slug: 'BITRIX24_CRM_CONTACT_ADD',
            name: 'Create Contact',
            description: 'Create a new contact in Bitrix24 CRM.',
            method: 'crm.contact.add',
            inputSchema: {
                type: 'object',
                properties: {
                    NAME: { type: 'string', description: 'First name' },
                    LAST_NAME: { type: 'string', description: 'Last name' },
                    PHONE: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                VALUE: { type: 'string' },
                                VALUE_TYPE: { type: 'string', enum: ['WORK', 'MOBILE', 'HOME'], default: 'MOBILE' },
                            },
                        },
                    },
                    EMAIL: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                VALUE: { type: 'string' },
                                VALUE_TYPE: { type: 'string', enum: ['WORK', 'HOME'], default: 'WORK' },
                            },
                        },
                    },
                    COMMENTS: { type: 'string', description: 'Notes about the contact' },
                },
                required: ['NAME'],
            },
        },
        {
            slug: 'BITRIX24_CRM_CONTACT_LIST',
            name: 'Search Contacts',
            description: 'Search contacts in Bitrix24 CRM by phone, name or email.',
            method: 'crm.contact.list',
            inputSchema: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'object',
                        description: 'Filter, e.g. { "PHONE": "+79001234567" }',
                    },
                    select: {
                        type: 'array',
                        items: { type: 'string' },
                        default: ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL'],
                    },
                },
            },
        },

        // ─── CRM: Deals ──────────────────────────────────────────────────
        {
            slug: 'BITRIX24_CRM_DEAL_ADD',
            name: 'Create Deal',
            description: 'Create a new deal (sale opportunity) in Bitrix24 CRM.',
            method: 'crm.deal.add',
            inputSchema: {
                type: 'object',
                properties: {
                    TITLE: { type: 'string', description: 'Deal title' },
                    CONTACT_ID: { type: 'number', description: 'Associated contact ID' },
                    OPPORTUNITY: { type: 'number', description: 'Deal amount' },
                    CURRENCY_ID: { type: 'string', description: 'Currency code (e.g. RUB, USD)', default: 'RUB' },
                    COMMENTS: { type: 'string', description: 'Deal comments' },
                    STAGE_ID: { type: 'string', description: 'Deal stage', default: 'NEW' },
                },
                required: ['TITLE'],
            },
        },
        {
            slug: 'BITRIX24_CRM_DEAL_LIST',
            name: 'Search Deals',
            description: 'Search deals in Bitrix24 CRM.',
            method: 'crm.deal.list',
            inputSchema: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'object',
                        description: 'Filter criteria',
                    },
                    select: {
                        type: 'array',
                        items: { type: 'string' },
                        default: ['ID', 'TITLE', 'STAGE_ID', 'OPPORTUNITY', 'CURRENCY_ID', 'CONTACT_ID'],
                    },
                },
            },
        },

        // ─── CRM: Activities (Tasks/Calendar) ────────────────────────────
        {
            slug: 'BITRIX24_CRM_ACTIVITY_ADD',
            name: 'Create Activity',
            description: 'Schedule a call, meeting, or task in Bitrix24 CRM.',
            method: 'crm.activity.add',
            inputSchema: {
                type: 'object',
                properties: {
                    SUBJECT: { type: 'string', description: 'Activity subject' },
                    TYPE_ID: {
                        type: 'number',
                        description: 'Activity type: 1=meeting, 2=call, 3=email, 6=task',
                        default: 2,
                    },
                    START_TIME: { type: 'string', description: 'Start time in ISO 8601 format' },
                    END_TIME: { type: 'string', description: 'End time in ISO 8601 format' },
                    DESCRIPTION: { type: 'string', description: 'Activity description' },
                    RESPONSIBLE_ID: { type: 'number', description: 'Responsible user ID', default: 1 },
                    COMMUNICATIONS: {
                        type: 'array',
                        description: 'Communication entries (phone/email of participant)',
                        items: {
                            type: 'object',
                            properties: {
                                VALUE: { type: 'string', description: 'Phone or email' },
                                ENTITY_ID: { type: 'number', description: 'Contact/Lead ID' },
                                ENTITY_TYPE_ID: { type: 'number', description: '1=lead, 3=contact' },
                                TYPE: { type: 'string', enum: ['PHONE', 'EMAIL'] },
                            },
                        },
                    },
                },
                required: ['SUBJECT'],
            },
        },
    ];

@Injectable()
export class Bitrix24Service {
    private readonly logger = new Logger(Bitrix24Service.name);

    constructor(private readonly httpService: HttpService) { }

    /**
     * Return the list of available Bitrix24 tools for registration.
     */
    getAvailableTools() {
        return BITRIX24_TOOLS.map((tool) => ({
            slug: tool.slug,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
    }

    /**
     * Execute a Bitrix24 API call.
     *
     * @param webhookUrl - The user's Bitrix24 webhook URL (e.g. https://domain.bitrix24.ru/rest/1/key/)
     * @param toolSlug  - Tool slug (e.g. BITRIX24_CRM_LEAD_ADD)
     * @param args      - Arguments for the API call
     */
    async executeAction(
        webhookUrl: string,
        toolSlug: string,
        args: Record<string, any>,
    ): Promise<string> {
        const tool = BITRIX24_TOOLS.find((t) => t.slug === toolSlug);
        if (!tool) {
            throw new Error(`Unknown Bitrix24 tool: ${toolSlug}`);
        }

        // Normalize webhook URL: ensure trailing slash
        const baseUrl = webhookUrl.endsWith('/') ? webhookUrl : `${webhookUrl}/`;
        const url = `${baseUrl}${tool.method}.json`;

        this.logger.log(`Bitrix24 API call: ${tool.method} → ${url}`);

        try {
            // For "add" methods, wrap args in { fields: { ... } }
            // For "list" methods, pass args directly
            const isAddMethod = tool.method.endsWith('.add');
            const payload = isAddMethod ? { fields: args } : args;

            const response = await firstValueFrom(
                this.httpService.post(url, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000,
                }),
            );

            const data = response.data;

            if (data.error) {
                this.logger.error(`Bitrix24 API error: ${data.error} — ${data.error_description}`);
                return JSON.stringify({
                    error: data.error,
                    description: data.error_description,
                });
            }

            // Trim large results for voice bot context
            const result = data.result;
            if (Array.isArray(result) && result.length > 10) {
                return JSON.stringify({
                    total: data.total || result.length,
                    items: result.slice(0, 10),
                    note: `Showing first 10 of ${data.total || result.length} results`,
                });
            }

            return JSON.stringify(data.result ?? data);
        } catch (error) {
            this.logger.error(`Bitrix24 API call failed: ${error.message}`);
            throw new Error(`Bitrix24 API error: ${error.message}`);
        }
    }

    /**
     * Validate a Bitrix24 webhook URL by making a test call.
     */
    async validateWebhook(webhookUrl: string): Promise<boolean> {
        try {
            const baseUrl = webhookUrl.endsWith('/') ? webhookUrl : `${webhookUrl}/`;
            const response = await firstValueFrom(
                this.httpService.get(`${baseUrl}profile.json`, { timeout: 10000 }),
            );
            return !!response.data?.result;
        } catch {
            return false;
        }
    }
}
