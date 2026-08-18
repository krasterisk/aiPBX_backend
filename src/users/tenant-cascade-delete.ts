import { Op, Sequelize, Transaction } from 'sequelize';

type AnyModel = {
    findAll: (opts: Record<string, unknown>) => Promise<Array<{ id: number | string; get?: (k: string) => unknown }>>;
    destroy: (opts: Record<string, unknown>) => Promise<number>;
    update: (values: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown>;
};

function model(sequelize: Sequelize, name: string): AnyModel | null {
    const m = sequelize.models[name] as unknown as AnyModel | undefined;
    return m ?? null;
}

async function destroyWhere(
    sequelize: Sequelize,
    name: string,
    where: Record<string, unknown>,
    transaction: Transaction,
): Promise<void> {
    const m = model(sequelize, name);
    if (!m) return;
    await m.destroy({ where, transaction });
}

function idsOf(rows: Array<{ id: number | string }>): Array<number | string> {
    return rows.map((r) => r.id).filter((id) => id != null);
}

/**
 * Deletes tenant-owned rows for the given member user ids.
 * When `deleteOwnerScoped` is true (owner deletion), also removes orgs, billing, payments, etc.
 */
export async function cascadeDeleteTenantData(
    sequelize: Sequelize,
    options: {
        ownerId: number;
        memberIds: number[];
        deleteOwnerScoped: boolean;
    },
    transaction: Transaction,
): Promise<void> {
    const { ownerId, memberIds, deleteOwnerScoped } = options;
    const idsNum = memberIds;
    const idsStr = memberIds.map(String);

    const assistantModel = model(sequelize, 'Assistant');
    const assistants = assistantModel
        ? await assistantModel.findAll({
              where: { userId: { [Op.in]: idsNum } },
              attributes: ['id'],
              transaction,
          })
        : [];
    const assistantIds = idsOf(assistants);

    const widgetKeyModel = model(sequelize, 'WidgetKey');
    const widgetKeys = widgetKeyModel
        ? await widgetKeyModel.findAll({
              where: { userId: { [Op.in]: idsNum } },
              attributes: ['id'],
              transaction,
          })
        : [];
    const widgetKeyIds = idsOf(widgetKeys);

    const chatModel = model(sequelize, 'Chat');
    const chats = chatModel
        ? await chatModel.findAll({
              where: { userId: { [Op.in]: idsNum } },
              attributes: ['id'],
              transaction,
          })
        : [];
    const chatIds = idsOf(chats);

    const kbModel = model(sequelize, 'KnowledgeBase');
    const knowledgeBases = kbModel
        ? await kbModel.findAll({
              where: { userId: { [Op.in]: idsNum } },
              attributes: ['id'],
              transaction,
          })
        : [];
    const kbIds = idsOf(knowledgeBases);

    const mcpServerModel = model(sequelize, 'McpServer');
    const mcpServers = mcpServerModel
        ? await mcpServerModel.findAll({
              where: { userId: { [Op.in]: idsNum } },
              attributes: ['id'],
              transaction,
          })
        : [];
    const mcpServerIds = idsOf(mcpServers);

    const cdrModel = model(sequelize, 'AiCdr');
    const cdrs = cdrModel
        ? await cdrModel.findAll({
              where: {
                  [Op.or]: [
                      { userId: { [Op.in]: idsStr } },
                      { vPbxUserId: { [Op.in]: idsStr } },
                  ],
              },
              attributes: ['channelId'],
              transaction,
          })
        : [];
    const channelIds = [...new Set(
        cdrs
            .map((r) => String((r as { channelId?: string }).channelId || ''))
            .filter(Boolean),
    )];

    // ── Junctions / dependents ──────────────────────────────────────────
    if (widgetKeyIds.length) {
        await destroyWhere(sequelize, 'WidgetSession', { widgetKeyId: { [Op.in]: widgetKeyIds } }, transaction);
    }
    if (assistantIds.length) {
        await destroyWhere(
            sequelize,
            'AssistantToolsModel',
            { assistantId: { [Op.in]: assistantIds } },
            transaction,
        );
        await destroyWhere(
            sequelize,
            'AssistantMcpServersModel',
            { assistantId: { [Op.in]: assistantIds } },
            transaction,
        );
    }
    if (chatIds.length) {
        await destroyWhere(sequelize, 'ChatToolsModel', { chatId: { [Op.in]: chatIds } }, transaction);
    }
    if (kbIds.length) {
        await destroyWhere(sequelize, 'KnowledgeChunk', { knowledgeBaseId: { [Op.in]: kbIds } }, transaction);
        await destroyWhere(sequelize, 'KnowledgeDocument', { knowledgeBaseId: { [Op.in]: kbIds } }, transaction);
    }
    if (mcpServerIds.length) {
        await destroyWhere(sequelize, 'McpToolPolicy', { userId: { [Op.in]: idsNum } }, transaction);
        await destroyWhere(
            sequelize,
            'McpToolRegistry',
            { mcpServerId: { [Op.in]: mcpServerIds } },
            transaction,
        );
        await destroyWhere(sequelize, 'McpCallLog', { userId: { [Op.in]: idsNum } }, transaction);
    }
    if (channelIds.length) {
        await destroyWhere(sequelize, 'AiAnalytics', { channelId: { [Op.in]: channelIds } }, transaction);
        await destroyWhere(sequelize, 'AiEvents', { channelId: { [Op.in]: channelIds } }, transaction);
        await destroyWhere(
            sequelize,
            'MetricValue',
            { channelId: { [Op.in]: channelIds } },
            transaction,
        );
    }

    await destroyWhere(sequelize, 'MetricOverride', { userId: { [Op.in]: idsStr } }, transaction);
    await destroyWhere(sequelize, 'CallTag', { userId: { [Op.in]: idsStr } }, transaction);
    await destroyWhere(sequelize, 'OperatorAnalytics', { userId: { [Op.in]: idsStr } }, transaction);
    await destroyWhere(sequelize, 'OperatorApiToken', { userId: { [Op.in]: idsStr } }, transaction);
    await destroyWhere(sequelize, 'OperatorProject', { userId: { [Op.in]: idsStr } }, transaction);

    // Resources referencing assistants / PBX before assistants & servers
    await destroyWhere(sequelize, 'WidgetKey', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'SipTrunks', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'SipAccounts', { userId: { [Op.in]: idsNum } }, transaction);

    if (assistantIds.length) {
        await destroyWhere(sequelize, 'Assistant', { id: { [Op.in]: assistantIds } }, transaction);
    } else {
        await destroyWhere(sequelize, 'Assistant', { userId: { [Op.in]: idsNum } }, transaction);
    }

    await destroyWhere(sequelize, 'PbxServers', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'AiTool', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'Chat', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'KnowledgeBase', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'KnowledgeDocument', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'McpServer', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'ApiKey', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'Prices', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'UserLimits', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'Logs', { userId: { [Op.in]: idsNum } }, transaction);
    await destroyWhere(sequelize, 'LegalAcceptance', { userId: { [Op.in]: idsStr } }, transaction);

    if (channelIds.length) {
        await destroyWhere(sequelize, 'AiCdr', { channelId: { [Op.in]: channelIds } }, transaction);
    }
    await destroyWhere(
        sequelize,
        'AiCdr',
        {
            [Op.or]: [{ userId: { [Op.in]: idsStr } }, { vPbxUserId: { [Op.in]: idsStr } }],
        },
        transaction,
    );
    await destroyWhere(
        sequelize,
        'AiEvents',
        {
            [Op.or]: [{ userId: { [Op.in]: idsStr } }, { vPbxUserId: { [Op.in]: idsStr } }],
        },
        transaction,
    );

    // Owner-scoped finance / legal entities
    if (deleteOwnerScoped) {
        const ownerStr = String(ownerId);
        await destroyWhere(sequelize, 'OrganizationDocument', { userId: ownerStr }, transaction);
        await destroyWhere(sequelize, 'BalanceThresholdAlert', { ownerUserId: ownerId }, transaction);
        await destroyWhere(sequelize, 'BalanceRunwayNotification', { ownerUserId: ownerId }, transaction);
        await destroyWhere(sequelize, 'Organization', { userId: ownerId }, transaction);
        await destroyWhere(sequelize, 'Payments', { userId: ownerStr }, transaction);
        await destroyWhere(sequelize, 'BalanceLedger', { userId: ownerStr }, transaction);
        await destroyWhere(sequelize, 'BillingRecord', { userId: ownerStr }, transaction);
    }

    // Helpdesk tickets may reference users as assignees (no FK cascade)
    const helpdesk = model(sequelize, 'HelpdeskTicket');
    if (helpdesk) {
        await helpdesk.update(
            { assigneeId: null },
            { where: { assigneeId: { [Op.in]: idsNum } }, transaction },
        );
    }

    await destroyWhere(sequelize, 'UserRoles', { userId: { [Op.in]: [...idsNum, ...idsStr] } }, transaction);
}