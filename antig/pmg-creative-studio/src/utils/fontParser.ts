import * as opentype from 'opentype.js';

export interface ExtractedFont {
    name: string;
    buffer: ArrayBuffer;
    url?: string;
}

/**
 * Utility to parse font files and extract individual fonts from collections (.ttc)
 */
export const fontParser = {
    /**
     * Parses a font file buffer. If it's a collection, it extracts all fonts.
     * If it's a single font, it returns just that one.
     */
    async parseFontBuffer(buffer: ArrayBuffer, fileName: string): Promise<ExtractedFont[]> {
        const view = new DataView(buffer);

        if (buffer.byteLength < 12) {
            console.error('File too small to be a font file.', buffer.byteLength);
            return [];
        }

        const tag = String.fromCharCode(
            view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
        );

        console.log(`[fontParser] Detected file header tag: ${tag} (Hex: ${view.getUint32(0).toString(16)})`);

        if (tag === 'ttcf') {
            return this.extractFromTTC(buffer);
        } else {
            console.log('[fontParser] Detected single font file');
            try {
                const font = opentype.parse(buffer);
                const name = font.getEnglishName('fontFamily') || fileName.split('.')[0];
                return [{ name, buffer }];
            } catch (err) {
                console.error('[fontParser] Failed to parse single font:', err);
                return [{ name: fileName.split('.')[0], buffer }];
            }
        }
    },

    /**
     * Extracts individual TTF fonts from a TTC collection by rebuilding them.
     * This handles shared tables correctly by copying them into a new standalone buffer.
     */
    extractFromTTC(buffer: ArrayBuffer): ExtractedFont[] {
        const view = new DataView(buffer);
        const numFonts = view.getUint32(8); // Offset 8: Number of fonts
        const versionRaw = view.getUint32(4);
        console.log(`[fontParser] TTC Collection: Version ${versionRaw.toString(16)}, contains ${numFonts} fonts.`);

        const extracted: ExtractedFont[] = [];

        for (let i = 0; i < numFonts; i++) {
            const fontOffset = view.getUint32(12 + i * 4);
            try {
                const standaloneBuffer = this.createStandaloneTTF(buffer, fontOffset);
                console.log(`[fontParser] Font ${i} at offset ${fontOffset} rebuilt. Size: ${standaloneBuffer.byteLength} bytes.`);

                let font;
                try {
                    font = opentype.parse(standaloneBuffer);
                } catch (parseErr) {
                    console.warn(`[fontParser] Opentype.js parse failure for font ${i}. Using fallback name.`, parseErr);
                    // Fallback: Use fileName as a base name if parsing failed but we have a buffer
                    extracted.push({ name: `Font ${i + 1}`, buffer: standaloneBuffer });
                    continue;
                }

                // Get name - prefer Full Name or Family Name
                let name = font.getEnglishName('fullName') || font.getEnglishName('fontFamily');
                if (!name) name = `Font ${i + 1}`;

                console.log(`[fontParser] Successfully extracted: ${name}`);
                extracted.push({ name, buffer: standaloneBuffer });
            } catch (err) {
                console.error(`[fontParser] Critical failure in extraction at index ${i}:`, err);
            }
        }

        return extracted;
    },

    /**
     * Creates a standalone .ttf buffer from a TTC buffer and a font offset.
     */
    createStandaloneTTF(ttcBuffer: ArrayBuffer, fontOffset: number): ArrayBuffer {
        const view = new DataView(ttcBuffer);

        // 1. Read TTF Offset Table (12 bytes)
        const numTables = view.getUint16(fontOffset + 4);

        // 2. Read Table Records (16 bytes each)
        const tableRecords = [];
        let totalTableSize = 0;
        for (let i = 0; i < numTables; i++) {
            const recordOffset = fontOffset + 12 + (i * 16);
            const tag = String.fromCharCode(
                view.getUint8(recordOffset),
                view.getUint8(recordOffset + 1),
                view.getUint8(recordOffset + 2),
                view.getUint8(recordOffset + 3)
            );
            const checksum = view.getUint32(recordOffset + 4);
            const offset = view.getUint32(recordOffset + 8);
            const length = view.getUint32(recordOffset + 12);

            // Align length to 4-byte boundaries for the next table
            const alignedLength = (length + 3) & ~3;

            tableRecords.push({ tag, checksum, offset, length, alignedLength });
            totalTableSize += alignedLength;
        }

        // 3. Calculate total size for the new TTF
        // Offset Table (12) + Table Records (numTables * 16) + Table Data (totalTableSize)
        const headerSize = 12 + (numTables * 16);
        const newBufferSize = headerSize + totalTableSize;
        const newBuffer = new ArrayBuffer(newBufferSize);
        const newView = new DataView(newBuffer);
        const newBytes = new Uint8Array(newBuffer);
        const oldBytes = new Uint8Array(ttcBuffer);

        // 4. Write new TTF Header and Records
        // Copy original Offset Table
        for (let j = 0; j < 12; j++) {
            newBytes[j] = oldBytes[fontOffset + j];
        }

        let currentDataOffset = headerSize;
        for (let i = 0; i < numTables; i++) {
            const record = tableRecords[i];
            const recordStart = 12 + (i * 16);

            // Write Tag
            for (let k = 0; k < 4; k++) newBytes[recordStart + k] = record.tag.charCodeAt(k);
            // Write Checksum
            newView.setUint32(recordStart + 4, record.checksum);
            // Write NEW Offset
            newView.setUint32(recordStart + 8, currentDataOffset);
            // Write Length
            newView.setUint32(recordStart + 12, record.length);

            // 5. Copy Table Data
            for (let k = 0; k < record.length; k++) {
                newBytes[currentDataOffset + k] = oldBytes[record.offset + k];
            }

            currentDataOffset += record.alignedLength;
        }

        return newBuffer;
    }
};
