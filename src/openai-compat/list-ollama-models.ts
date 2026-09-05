export async function listOllamaModelNames(ollamaUrl: string): Promise<string[]> {
    const base = ollamaUrl.replace(/\/$/, '');
    const response = await fetch(`${base}/api/tags`);
    if (!response.ok) {
        throw new Error(`Ollama tags HTTP ${response.status}`);
    }
    const data = await response.json() as { models?: Array<{ name?: string; model?: string }> };
    return (data.models || [])
        .map((m) => m.name || m.model || '')
        .filter(Boolean);
}
