import sharp from 'sharp';

export interface DigestChartPng {
    filename: string;
    cid: string;
    buffer: Buffer;
    caption: string;
}

interface Slice {
    label: string;
    value: number;
    color: string;
}

interface BarItem {
    label: string;
    value: number;
    color?: string;
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function svgToPng(svg: string): Promise<Buffer> {
    return sharp(Buffer.from(svg)).png().toBuffer();
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
    if (end - start >= 359.9) {
        // Full circle as two arcs
        const p0 = polarToCartesian(cx, cy, rOuter, 0);
        const p1 = polarToCartesian(cx, cy, rOuter, 180);
        const p2 = polarToCartesian(cx, cy, rInner, 180);
        const p3 = polarToCartesian(cx, cy, rInner, 0);
        return [
            `M ${p0.x} ${p0.y}`,
            `A ${rOuter} ${rOuter} 0 1 1 ${p1.x} ${p1.y}`,
            `A ${rOuter} ${rOuter} 0 1 1 ${p0.x} ${p0.y}`,
            `M ${p3.x} ${p3.y}`,
            `A ${rInner} ${rInner} 0 1 0 ${p2.x} ${p2.y}`,
            `A ${rInner} ${rInner} 0 1 0 ${p3.x} ${p3.y}`,
            'Z',
        ].join(' ');
    }
    const large = end - start > 180 ? 1 : 0;
    const so = polarToCartesian(cx, cy, rOuter, start);
    const eo = polarToCartesian(cx, cy, rOuter, end);
    const si = polarToCartesian(cx, cy, rInner, end);
    const ei = polarToCartesian(cx, cy, rInner, start);
    return [
        `M ${so.x} ${so.y}`,
        `A ${rOuter} ${rOuter} 0 ${large} 1 ${eo.x} ${eo.y}`,
        `L ${si.x} ${si.y}`,
        `A ${rInner} ${rInner} 0 ${large} 0 ${ei.x} ${ei.y}`,
        'Z',
    ].join(' ');
}

export async function renderDonutChart(
    title: string,
    slices: Slice[],
    opts?: { filename?: string; cid?: string },
): Promise<DigestChartPng> {
    const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    const cx = 160;
    const cy = 150;
    const rOuter = 90;
    const rInner = 52;
    let angle = 0;
    const paths = slices.map(slice => {
        const span = (Math.max(0, slice.value) / total) * 360;
        const start = angle;
        const end = angle + span;
        angle = end;
        if (span <= 0.01) return '';
        return `<path d="${donutSlicePath(cx, cy, rOuter, rInner, start, end)}" fill="${slice.color}"/>`;
    }).join('');

    const legend = slices.map((s, i) => {
        const y = 300 + i * 22;
        return `<rect x="40" y="${y - 10}" width="12" height="12" rx="2" fill="${s.color}"/>
<text x="60" y="${y}" font-size="13" fill="#334155" font-family="Arial,sans-serif">${escapeXml(s.label)}: ${Math.round(s.value)}%</text>`;
    }).join('');

    const height = 300 + slices.length * 22 + 24;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${height}" viewBox="0 0 320 ${height}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="160" y="28" text-anchor="middle" font-size="15" font-weight="600" fill="#0f172a" font-family="Arial,sans-serif">${escapeXml(title)}</text>
${paths}
${legend}
</svg>`;

    const buffer = await svgToPng(svg);
    const filename = opts?.filename ?? 'donut.png';
    const cid = opts?.cid ?? 'digest-donut';
    return { filename, cid, buffer, caption: title };
}

export async function renderHorizontalBars(
    title: string,
    items: BarItem[],
    opts?: { filename?: string; cid?: string; maxValue?: number },
): Promise<DigestChartPng> {
    const maxVal = opts?.maxValue ?? Math.max(100, ...items.map(i => i.value), 1);
    const rowH = 28;
    const top = 48;
    const height = top + items.length * rowH + 24;
    const barX = 140;
    const barMaxW = 150;

    const rows = items.map((item, i) => {
        const y = top + i * rowH;
        const w = Math.max(2, (Math.max(0, item.value) / maxVal) * barMaxW);
        const color = item.color ?? '#0EA5E9';
        return `<text x="12" y="${y + 14}" font-size="12" fill="#334155" font-family="Arial,sans-serif">${escapeXml(truncate(item.label, 18))}</text>
<rect x="${barX}" y="${y}" width="${w}" height="16" rx="3" fill="${color}"/>
<text x="${barX + w + 6}" y="${y + 13}" font-size="12" fill="#0f172a" font-family="Arial,sans-serif">${Math.round(item.value)}</text>`;
    }).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${height}" viewBox="0 0 320 ${height}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="160" y="28" text-anchor="middle" font-size="15" font-weight="600" fill="#0f172a" font-family="Arial,sans-serif">${escapeXml(title)}</text>
${rows}
</svg>`;

    const buffer = await svgToPng(svg);
    return {
        filename: opts?.filename ?? 'bars.png',
        cid: opts?.cid ?? 'digest-bars',
        buffer,
        caption: title,
    };
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}
