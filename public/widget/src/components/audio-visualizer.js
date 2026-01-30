/**
 * Audio Visualizer Component
 */
export class AudioVisualizer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.analyser = null;
        this.animationId = null;
        this.audioContext = null;
    }

    connect(audioStream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(audioStream);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 128;
            this.analyser.smoothingTimeConstant = 0.8;

            source.connect(this.analyser);

            this.draw();
        } catch (error) {
            console.error('Failed to create audio visualizer:', error);
        }
    }

    draw() {
        this.animationId = requestAnimationFrame(() => this.draw());

        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw bars
        const barWidth = (this.canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * this.canvas.height * 0.8;

            // Gradient color
            const hue = (i / bufferLength) * 280 + 240; // Purple to blue
            this.ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;

            // Draw rounded bar
            this.ctx.beginPath();
            this.ctx.roundRect(
                x,
                this.canvas.height - barHeight,
                barWidth - 2,
                barHeight,
                2
            );
            this.ctx.fill();

            x += barWidth;
        }
    }

    disconnect() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
    }
}
