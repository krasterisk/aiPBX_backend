import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { OperatorInsightsResponse } from './lib/insights-schema';

interface MemoryEntry {
    payload: string;
    expiry: number;
}

@Injectable()
export class InsightsCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(InsightsCacheService.name);
    private readonly memory = new Map<string, MemoryEntry>();
    private redis: Redis | null = null;
    private redisReady = false;

    async onModuleInit(): Promise<void> {
        const url = process.env.REDIS_URL?.trim();
        if (!url) {
            this.logger.log('Insights cache: in-memory (REDIS_URL not set)');
            return;
        }

        try {
            const { default: IORedis } = await import('ioredis');
            const client = new IORedis(url, {
                maxRetriesPerRequest: 1,
                enableReadyCheck: true,
                lazyConnect: true,
            });
            await client.connect();
            this.redis = client;
            this.redisReady = true;
            this.logger.log('Insights cache: Redis enabled');
        } catch (err) {
            this.logger.warn(
                `Insights cache: Redis unavailable (${err instanceof Error ? err.message : String(err)}), using in-memory`,
            );
            this.redis = null;
            this.redisReady = false;
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.redis) {
            await this.redis.quit().catch(() => undefined);
            this.redis = null;
            this.redisReady = false;
        }
    }

    async get(key: string): Promise<OperatorInsightsResponse | null> {
        if (this.redisReady && this.redis) {
            try {
                const raw = await this.redis.get(key);
                if (!raw) return null;
                return JSON.parse(raw) as OperatorInsightsResponse;
            } catch (err) {
                this.logger.warn(`Insights cache Redis get failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const entry = this.memory.get(key);
        if (!entry) return null;
        if (Date.now() >= entry.expiry) {
            this.memory.delete(key);
            return null;
        }
        return JSON.parse(entry.payload) as OperatorInsightsResponse;
    }

    async set(key: string, data: OperatorInsightsResponse, ttlMs: number): Promise<void> {
        const payload = JSON.stringify(data);
        const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));

        if (this.redisReady && this.redis) {
            try {
                await this.redis.set(key, payload, 'EX', ttlSec);
                return;
            } catch (err) {
                this.logger.warn(`Insights cache Redis set failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        this.memory.set(key, {
            payload,
            expiry: Date.now() + ttlMs,
        });
    }
}
