/**
 * Test MCP Server — Streamable HTTP transport
 *
 * Provides 3 test tools:
 *   - echo: returns the input as-is
 *   - get_time: returns current server time
 *   - calculator: performs basic math operations
 *
 * Usage:
 *   npx ts-node test/mcp-test-server.ts
 *
 * Server listens on http://localhost:3777/mcp
 */

import * as http from 'http';

const PORT = 3777;

// ─── Tool Definitions ──────────────────────────────────────────

const TOOLS = [
    {
        name: 'echo',
        description: 'Echoes back the provided message. Useful for testing connectivity.',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Message to echo back' },
            },
            required: ['message'],
        },
    },
    {
        name: 'get_time',
        description: 'Returns the current server date and time with timezone.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'calculator',
        description: 'Performs basic math: add, subtract, multiply, divide.',
        inputSchema: {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    enum: ['add', 'subtract', 'multiply', 'divide'],
                    description: 'Math operation to perform',
                },
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' },
            },
            required: ['operation', 'a', 'b'],
        },
    },
];

// ─── Tool Handlers ─────────────────────────────────────────────

function handleToolCall(name: string, args: any): any {
    switch (name) {
        case 'echo':
            return { content: [{ type: 'text', text: args.message || '(empty)' }] };

        case 'get_time':
            return {
                content: [{
                    type: 'text',
                    text: new Date().toISOString(),
                }],
            };

        case 'calculator': {
            const { operation, a, b } = args;
            let result: number;
            switch (operation) {
                case 'add': result = a + b; break;
                case 'subtract': result = a - b; break;
                case 'multiply': result = a * b; break;
                case 'divide':
                    if (b === 0) {
                        return {
                            content: [{ type: 'text', text: 'Error: division by zero' }],
                            isError: true,
                        };
                    }
                    result = a / b;
                    break;
                default:
                    return {
                        content: [{ type: 'text', text: `Unknown operation: ${operation}` }],
                        isError: true,
                    };
            }
            return {
                content: [{ type: 'text', text: `${a} ${operation} ${b} = ${result}` }],
            };
        }

        default:
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            };
    }
}

// ─── JSON-RPC Handler ──────────────────────────────────────────

function handleJsonRpc(request: any): any {
    const { id, method, params } = request;

    console.log(`  → ${method}`, params ? JSON.stringify(params).slice(0, 100) : '');

    switch (method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2025-03-26',
                    serverInfo: {
                        name: 'aiPBX-test-mcp-server',
                        version: '1.0.0',
                    },
                    capabilities: {
                        tools: { listChanged: false },
                    },
                },
            };

        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: { tools: TOOLS },
            };

        case 'tools/call':
            const toolName = params?.name;
            const toolArgs = params?.arguments || {};
            console.log(`  🔧 Calling tool: ${toolName}`, toolArgs);
            const toolResult = handleToolCall(toolName, toolArgs);
            return {
                jsonrpc: '2.0',
                id,
                result: toolResult,
            };

        default:
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` },
            };
    }
}

// ─── HTTP Server ───────────────────────────────────────────────

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method !== 'POST' || req.url !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use POST /mcp' }));
        return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
        try {
            const request = JSON.parse(body);
            const response = handleJsonRpc(request);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'MCP-Protocol-Version': '2025-03-26',
            });
            res.end(JSON.stringify(response));
        } catch (e) {
            console.error('Parse error:', e.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
            }));
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Test MCP Server running on http://localhost:${PORT}/mcp`);
    console.log(`\n📦 Available tools:`);
    TOOLS.forEach((t) => console.log(`   • ${t.name} — ${t.description}`));
    console.log(`\n💡 Add this server in your MCP client:`);
    console.log(`   URL:       http://localhost:${PORT}/mcp`);
    console.log(`   Transport: http`);
    console.log(`   Auth:      none\n`);
});
