import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { McpToolPolicy } from '../models/mcp-tool-policy.model';
import { McpCallLog } from '../models/mcp-call-log.model';
import { Op } from 'sequelize';

@Injectable()
export class McpPolicyService {
    private readonly logger = new Logger(McpPolicyService.name);

    constructor(
        @InjectModel(McpToolPolicy)
        private readonly policyModel: typeof McpToolPolicy,
        @InjectModel(McpCallLog)
        private readonly callLogModel: typeof McpCallLog,
    ) { }

    /**
     * Validate a tool call against all applicable policies.
     *  Throws if any policy is violated.
     */
    async validateToolCall(
        toolRegistryId: number,
        args: any,
        userId: number,
    ): Promise<void> {
        const policies = await this.policyModel.findAll({
            where: { mcpToolRegistryId: toolRegistryId },
        });

        for (const policy of policies) {
            switch (policy.policyType) {
                case 'rate_limit':
                    await this.checkRateLimit(policy, toolRegistryId, userId);
                    break;
                case 'param_restrict':
                    this.checkParamRestrictions(policy, args);
                    break;
                case 'require_approval':
                    throw new Error(
                        `This tool requires manual approval from an operator before it can be executed. ` +
                        `Please inform the user that their request has been noted but cannot be completed automatically. ` +
                        `An operator will need to approve this action.`
                    );
            }
        }
    }

    /**
     * Check rate limiting — counts recent calls within the time window.
     */
    private async checkRateLimit(
        policy: McpToolPolicy,
        toolRegistryId: number,
        userId: number,
    ): Promise<void> {
        const config = policy.policyConfig || {};
        const maxCalls = config.maxCallsPerMinute || 60;
        const windowMs = (config.windowSeconds || 60) * 1000;

        const sinceDate = new Date(Date.now() - windowMs);

        const recentCalls = await this.callLogModel.count({
            where: {
                userId,
                status: 'success',
                createdAt: { [Op.gte]: sinceDate },
            },
        });

        if (recentCalls >= maxCalls) {
            throw new Error(
                `Rate limit exceeded for tool (${recentCalls}/${maxCalls} calls in last ${windowMs / 1000}s)`,
            );
        }
    }

    /**
     * Check parameter restrictions — removes or blocks restricted params.
     */
    private checkParamRestrictions(policy: McpToolPolicy, args: any): void {
        const config = policy.policyConfig || {};
        const blockedParams = config.blockedParams || [];

        if (args && typeof args === 'object') {
            for (const param of blockedParams) {
                if (param in args) {
                    throw new Error(`Parameter "${param}" is blocked by policy`);
                }
            }
        }
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    async createPolicy(data: {
        policyType: string;
        policyConfig: any;
        mcpToolRegistryId: number;
        userId: number;
    }): Promise<McpToolPolicy> {
        return this.policyModel.create(data as any);
    }

    async getPoliciesByTool(toolRegistryId: number): Promise<McpToolPolicy[]> {
        return this.policyModel.findAll({
            where: { mcpToolRegistryId: toolRegistryId },
        });
    }

    async deletePolicy(policyId: number, userId: number): Promise<void> {
        const deleted = await this.policyModel.destroy({
            where: { id: policyId, userId },
        });
        if (!deleted) throw new Error(`Policy ${policyId} not found`);
    }
}
