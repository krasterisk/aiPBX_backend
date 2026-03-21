import { Injectable, Logger } from '@nestjs/common';

/**
 * Parser Service — extracts plain text from various file formats and URLs.
 *
 * Supported:
 *   - PDF (via pdf-parse)
 *   - DOCX (via mammoth)
 *   - TXT / MD (as-is)
 *   - URL (via cheerio — HTML → text)
 */
@Injectable()
export class ParserService {
    private readonly logger = new Logger(ParserService.name);

    /**
     * Parse buffer into plain text based on file type.
     */
    async parseFile(buffer: Buffer, fileType: string, fileName?: string): Promise<string> {
        switch (fileType.toLowerCase()) {
            case 'pdf':
                return this.parsePdf(buffer);
            case 'docx':
                return this.parseDocx(buffer);
            case 'txt':
            case 'md':
            case 'text':
                return buffer.toString('utf-8');
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    /**
     * Fetch a URL and extract text content from HTML.
     */
    async parseUrl(url: string): Promise<string> {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; aiPBX Knowledge Bot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,text/plain',
                },
                signal: AbortSignal.timeout(30000),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const contentType = res.headers.get('content-type') || '';
            const body = await res.text();

            if (contentType.includes('text/plain')) {
                return body;
            }

            // Parse HTML
            return this.extractTextFromHtml(body);
        } catch (err) {
            this.logger.error(`Failed to parse URL ${url}: ${err.message}`);
            throw new Error(`Failed to fetch URL: ${err.message}`);
        }
    }

    /**
     * Extract text from PDF using pdf-parse.
     */
    private async parsePdf(buffer: Buffer): Promise<string> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { PDFParse } = require('pdf-parse');
            const parser = new PDFParse({ data: buffer, verbosity: 0 });
            const result = await parser.getText();
            await parser.destroy();
            return result.text || '';
        } catch (err) {
            this.logger.error(`PDF parse error: ${err.message}`);
            throw new Error(`Failed to parse PDF: ${err.message}. Is pdf-parse installed?`);
        }
    }

    /**
     * Extract text from DOCX using mammoth.
     */
    private async parseDocx(buffer: Buffer): Promise<string> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            return result.value || '';
        } catch (err) {
            this.logger.error(`DOCX parse error: ${err.message}`);
            throw new Error(`Failed to parse DOCX: ${err.message}. Is mammoth installed?`);
        }
    }

    /**
     * Extract meaningful text from HTML (remove nav, scripts, styles, etc).
     * Uses cheerio for server-side HTML parsing.
     */
    private extractTextFromHtml(html: string): string {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);

            // Remove non-content elements
            $('script, style, nav, header, footer, iframe, noscript, svg, form, button').remove();
            $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
            $('.nav, .navbar, .menu, .sidebar, .footer, .header, .cookie-banner').remove();

            // Get text from content areas
            let text = '';
            const contentSelectors = ['main', 'article', '.content', '#content', '.post', '.entry'];
            for (const sel of contentSelectors) {
                const el = $(sel);
                if (el.length > 0) {
                    text = el.text();
                    break;
                }
            }

            // Fallback to body text
            if (!text) {
                text = $('body').text();
            }

            // Normalize whitespace
            return text
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n\n')
                .trim();
        } catch (err) {
            this.logger.error(`HTML parse error: ${err.message}`);
            // Fallback: strip tags with regex
            return html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
    }
}
