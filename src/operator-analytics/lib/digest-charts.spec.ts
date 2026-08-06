import { renderDonutChart, renderHorizontalBars } from './digest-charts';

describe('digest-charts', () => {
    it('renderDonutChart returns a non-empty PNG buffer', async () => {
        const chart = await renderDonutChart('Sentiment', [
            { label: 'Positive', value: 50, color: '#10b981' },
            { label: 'Neutral', value: 30, color: '#94a3b8' },
            { label: 'Negative', value: 20, color: '#ef4444' },
        ], { filename: 's.png', cid: 's' });

        expect(chart.buffer.length).toBeGreaterThan(100);
        expect(chart.buffer[0]).toBe(0x89); // PNG magic
        expect(chart.cid).toBe('s');
    });

    it('renderHorizontalBars returns a non-empty PNG buffer', async () => {
        const chart = await renderHorizontalBars('Metrics', [
            { label: 'Greeting', value: 80 },
            { label: 'Script', value: 65 },
        ], { filename: 'm.png', cid: 'm', maxValue: 100 });

        expect(chart.buffer.length).toBeGreaterThan(100);
        expect(chart.caption).toBe('Metrics');
    });
});
