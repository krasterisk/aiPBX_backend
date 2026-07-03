export const HELPDESK_TICKET_STATUSES = [
    'new',
    'in_progress',
    'waiting_client',
    'resolved',
    'closed',
] as const;

export type HelpdeskTicketStatus = (typeof HELPDESK_TICKET_STATUSES)[number];

export const HELPDESK_TICKET_CATEGORIES = [
    'technical',
    'billing',
    'sales',
    'spam',
    'other',
] as const;

export type HelpdeskTicketCategory = (typeof HELPDESK_TICKET_CATEGORIES)[number];

export const HELPDESK_TICKET_PRIORITIES = [
    'urgent',
    'high',
    'normal',
    'low',
] as const;

export type HelpdeskTicketPriority = (typeof HELPDESK_TICKET_PRIORITIES)[number];

export const HELPDESK_TICKET_SOURCES = [
    'voice',
    'chat',
    'manual',
    'email',
] as const;

export type HelpdeskTicketSource = (typeof HELPDESK_TICKET_SOURCES)[number];

export const HELPDESK_MESSAGE_ROLES = [
    'user',
    'assistant',
    'operator',
    'system',
] as const;

export type HelpdeskMessageRole = (typeof HELPDESK_MESSAGE_ROLES)[number];

export const HELPDESK_PBX_TYPES = ['cloud', 'on_prem'] as const;

export type HelpdeskPbxType = (typeof HELPDESK_PBX_TYPES)[number];
