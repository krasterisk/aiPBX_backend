const http = require('http');

async function rpc(method, params) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ jsonrpc: '2.0', id: String(Date.now()), method, params });
        const req = http.request(
            { hostname: 'localhost', port: 3777, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { resolve(data); }
                });
            },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

(async () => {
    console.log('=== 1. Initialize ===');
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', clientInfo: { name: 'test', version: '1.0' }, capabilities: { tools: {} } });
    console.log(JSON.stringify(init, null, 2));

    console.log('\n=== 2. List Tools ===');
    const list = await rpc('tools/list');
    console.log(JSON.stringify(list, null, 2));

    console.log('\n=== 3. Call echo ===');
    const echo = await rpc('tools/call', { name: 'echo', arguments: { message: 'Hello from aiPBX!' } });
    console.log(JSON.stringify(echo, null, 2));

    console.log('\n=== 4. Call calculator ===');
    const calc = await rpc('tools/call', { name: 'calculator', arguments: { operation: 'multiply', a: 6, b: 7 } });
    console.log(JSON.stringify(calc, null, 2));

    console.log('\n=== 5. Call get_time ===');
    const time = await rpc('tools/call', { name: 'get_time', arguments: {} });
    console.log(JSON.stringify(time, null, 2));

    console.log('\n✅ All tests passed!');
})();
