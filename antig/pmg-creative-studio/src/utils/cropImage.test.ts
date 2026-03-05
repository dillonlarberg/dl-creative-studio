import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { doesImageCoverCrop, getCroppedImg } from './cropImage';

describe('doesImageCoverCrop', () => {
    const imageWidth = 1000;
    const imageHeight = 800;

    it('returns true when crop area is fully within image bounds', () => {
        const crop = { x: 100, y: 100, width: 500, height: 400 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(true);
    });

    it('returns true when crop area exactly matches image bounds', () => {
        const crop = { x: 0, y: 0, width: 1000, height: 800 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(true);
    });

    it('returns false when crop extends beyond right edge', () => {
        const crop = { x: 600, y: 0, width: 500, height: 400 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(false);
    });

    it('returns false when crop extends beyond bottom edge', () => {
        const crop = { x: 0, y: 500, width: 400, height: 400 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(false);
    });

    it('returns false when crop has negative x (extends beyond left edge)', () => {
        const crop = { x: -50, y: 0, width: 500, height: 400 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(false);
    });

    it('returns false when crop has negative y (extends beyond top edge)', () => {
        const crop = { x: 0, y: -50, width: 500, height: 400 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(false);
    });

    it('returns false when crop is larger than image in both dimensions', () => {
        const crop = { x: -100, y: -100, width: 1200, height: 1000 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(false);
    });

    it('returns true for zero-size crop at origin', () => {
        const crop = { x: 0, y: 0, width: 0, height: 0 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(true);
    });

    it('returns true when crop is a single pixel inside bounds', () => {
        const crop = { x: 500, y: 400, width: 1, height: 1 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(true);
    });

    it('returns true when crop touches the exact boundary edges', () => {
        const crop = { x: 0, y: 0, width: 1000, height: 800 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(true);
    });

    it('returns false when crop exceeds bounds by just 1 pixel on the right', () => {
        const crop = { x: 0, y: 0, width: 1001, height: 800 };
        expect(doesImageCoverCrop(imageWidth, imageHeight, crop)).toBe(false);
    });
});

// Helper: mock Image class that fires load on src set
function createMockImageClass() {
    const origImage = globalThis.Image;
    globalThis.Image = class {
        width = 1000;
        height = 800;
        crossOrigin = '';
        private _listeners: Record<string, (() => void)[]> = {};
        private _src = '';

        addEventListener(event: string, handler: () => void) {
            (this._listeners[event] ??= []).push(handler);
        }

        set src(val: string) {
            this._src = val;
            // Fire load asynchronously after src is set
            setTimeout(() => {
                this._listeners['load']?.forEach((h) => h());
            }, 0);
        }
        get src() {
            return this._src;
        }
    } as unknown as typeof origImage;

    return () => {
        globalThis.Image = origImage;
    };
}

describe('getCroppedImg', () => {
    const mockDrawImage = vi.fn();
    const mockGetContext = vi.fn();
    let fetchMock: Mock;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockDrawImage.mockClear();
        mockGetContext.mockClear();

        mockGetContext.mockReturnValue({ drawImage: mockDrawImage });

        // Mock createElement('canvas')
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            if (tag === 'canvas') {
                const canvas = originalCreateElement('canvas');
                vi.spyOn(canvas, 'getContext').mockImplementation(mockGetContext);
                canvas.toBlob = ((cb: BlobCallback) => {
                    cb(new Blob(['fake-image'], { type: 'image/jpeg' }));
                }) as typeof canvas.toBlob;
                return canvas;
            }
            return originalCreateElement(tag);
        });

        // Store fetch mock ref so tests can override it
        fetchMock = vi.fn().mockResolvedValue(
            new Response(new Blob(['fake'], { type: 'image/jpeg' }), { status: 200 })
        );
        vi.stubGlobal('fetch', fetchMock);

        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    it('returns a Blob with correct crop parameters', async () => {
        const restore = createMockImageClass();

        const crop = { x: 100, y: 100, width: 500, height: 400 };
        const blob = await getCroppedImg('https://example.com/image.jpg', crop, 1080, 1920);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockDrawImage).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/image.jpg');

        restore();
    });

    it('throws when fetch returns non-ok response', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);

        const crop = { x: 0, y: 0, width: 100, height: 100 };
        await expect(getCroppedImg('https://example.com/missing.jpg', crop)).rejects.toThrow(
            'Failed to fetch image (404)'
        );
    });

    it('throws when fetch rejects (network error)', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        const crop = { x: 0, y: 0, width: 100, height: 100 };
        await expect(getCroppedImg('https://example.com/missing.jpg', crop)).rejects.toThrow(
            'Failed to fetch'
        );
    });

    it('throws when canvas context is unavailable', async () => {
        mockGetContext.mockReturnValue(null);
        const restore = createMockImageClass();

        const crop = { x: 0, y: 0, width: 100, height: 100 };
        await expect(getCroppedImg('https://example.com/img.jpg', crop)).rejects.toThrow(
            'Could not get canvas context'
        );

        restore();
    });

    it('uses default output dimensions of 1080x1920', async () => {
        const restore = createMockImageClass();

        const crop = { x: 0, y: 0, width: 500, height: 400 };
        const blob = await getCroppedImg('https://example.com/img.jpg', crop);

        expect(blob).toBeInstanceOf(Blob);
        // Second drawImage call scales to output dimensions
        const scaleCall = mockDrawImage.mock.calls[1];
        expect(scaleCall[1]).toBe(0);
        expect(scaleCall[2]).toBe(0);
        expect(scaleCall[3]).toBe(1080);
        expect(scaleCall[4]).toBe(1920);

        restore();
    });

    it('throws when image fails to decode', async () => {
        const origImage = globalThis.Image;
        globalThis.Image = class {
            crossOrigin = '';
            private _listeners: Record<string, (() => void)[]> = {};
            private _src = '';

            addEventListener(event: string, handler: () => void) {
                (this._listeners[event] ??= []).push(handler);
            }

            set src(val: string) {
                this._src = val;
                setTimeout(() => {
                    this._listeners['error']?.forEach((h) => h());
                }, 0);
            }
            get src() {
                return this._src;
            }
        } as unknown as typeof origImage;

        const crop = { x: 0, y: 0, width: 100, height: 100 };
        await expect(getCroppedImg('https://example.com/bad.jpg', crop)).rejects.toThrow(
            'Failed to decode image'
        );

        globalThis.Image = origImage;
    });

    it('throws when toBlob returns null', async () => {
        const restore = createMockImageClass();

        // Get the current mock and update it to return null from toBlob
        // We need to get the real createElement from under the mock
        const existingMock = vi.mocked(document.createElement);
        existingMock.mockImplementation((tag: string) => {
            if (tag === 'canvas') {
                // Use Object.getPrototypeOf to get the original
                const canvas = Document.prototype.createElement.call(document, 'canvas') as HTMLCanvasElement;
                vi.spyOn(canvas, 'getContext').mockImplementation(mockGetContext as typeof canvas.getContext);
                canvas.toBlob = ((cb: BlobCallback) => {
                    cb(null);
                }) as typeof canvas.toBlob;
                return canvas;
            }
            return Document.prototype.createElement.call(document, tag);
        });

        const crop = { x: 0, y: 0, width: 100, height: 100 };
        await expect(getCroppedImg('https://example.com/img.jpg', crop)).rejects.toThrow(
            'Failed to export cropped image'
        );

        restore();
    });
});
