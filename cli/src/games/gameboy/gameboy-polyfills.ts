/**
 * Polyfills for browser APIs needed by gameboy-emulator in Node.js/Bun
 */

// Polyfill ImageData
let imageDataCreateCount = 0;
class ImageDataPolyfill {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: PredefinedColorSpace = "srgb";

  constructor(width: number, height: number);
  constructor(data: Uint8ClampedArray, width: number, height?: number);
  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    imageDataCreateCount++;
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      if (imageDataCreateCount <= 5) {
        console.log(`[Polyfill] ImageData created #${imageDataCreateCount}: ${this.width}x${this.height}, data length: ${this.data.length}`);
      }
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height ?? (dataOrWidth.length / 4 / widthOrHeight);
      if (imageDataCreateCount <= 5) {
        console.log(`[Polyfill] ImageData created from existing data #${imageDataCreateCount}: ${this.width}x${this.height}`);
      }
    }
  }
}

// Polyfill AudioContext with a no-op implementation
class AudioContextPolyfill {
  readonly sampleRate = 44100;
  readonly state = "suspended";
  readonly destination = { connect: () => {}, disconnect: () => {} };
  readonly audioWorklet = {
    addModule: () => Promise.resolve(),
  };

  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {},
    };
  }
  createOscillator() {
    return {
      frequency: { value: 440 },
      type: "sine",
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createBuffer() {
    return {
      getChannelData: () => new Float32Array(1024),
    };
  }
}

// Polyfill AudioWorkletNode
class AudioWorkletNodePolyfill {
  port = {
    postMessage: () => {},
    onmessage: null,
  };
  connect() {}
  disconnect() {}
}

// Apply polyfills to globalThis immediately on import
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = ImageDataPolyfill;
}
if (typeof globalThis.AudioContext === "undefined") {
  (globalThis as any).AudioContext = AudioContextPolyfill;
}
if (typeof globalThis.AudioWorkletNode === "undefined") {
  (globalThis as any).AudioWorkletNode = AudioWorkletNodePolyfill;
}
// Some libs check for window
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = globalThis;
}

// Polyfill navigator with gamepad support
if (typeof globalThis.navigator === "undefined" || !(globalThis.navigator as any).getGamepads) {
  (globalThis as any).navigator = {
    ...(globalThis as any).navigator,
    getGamepads: () => [],
    userAgent: "Bun",
    language: "en-US",
  };
}

// Polyfill requestAnimationFrame
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback): number => {
    return setTimeout(() => callback(performance.now()), 16) as unknown as number;
  };
}
if (typeof globalThis.cancelAnimationFrame === "undefined") {
  (globalThis as any).cancelAnimationFrame = (id: number): void => {
    clearTimeout(id);
  };
}

// Create a proper canvas mock that stores pixel data
class CanvasRenderingContext2DPolyfill {
  private canvas: any;
  private pixels: Uint8ClampedArray;
  public fillStyle: string = "#000000";
  public strokeStyle: string = "#000000";
  public globalAlpha: number = 1;
  public imageSmoothingEnabled: boolean = true;

  constructor(canvas: any) {
    this.canvas = canvas;
    this.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }

  private parseColor(color: string): [number, number, number, number] {
    // Parse hex color
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          255
        ];
      }
    }
    // Parse rgb/rgba
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbMatch) {
      return [
        parseInt(rgbMatch[1]),
        parseInt(rgbMatch[2]),
        parseInt(rgbMatch[3]),
        rgbMatch[4] ? Math.floor(parseFloat(rgbMatch[4]) * 255) : 255
      ];
    }
    return [0, 0, 0, 255];
  }

  createImageData(sw: number | ImageData, sh?: number): ImageData {
    if (typeof sw === "number") {
      return new (globalThis as any).ImageData(sw, sh!);
    }
    return new (globalThis as any).ImageData(sw.width, sw.height);
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    const imageData = new (globalThis as any).ImageData(sw, sh);
    // Copy pixel data from our buffer
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcX = sx + x;
        const srcY = sy + y;
        if (srcX >= 0 && srcX < this.canvas.width && srcY >= 0 && srcY < this.canvas.height) {
          const srcIdx = (srcY * this.canvas.width + srcX) * 4;
          const dstIdx = (y * sw + x) * 4;
          imageData.data[dstIdx] = this.pixels[srcIdx];
          imageData.data[dstIdx + 1] = this.pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = this.pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = this.pixels[srcIdx + 3];
        }
      }
    }
    return imageData;
  }

  putImageData(imageData: ImageData, dx: number, dy: number) {
    // Copy imageData to our pixel buffer
    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const dstX = dx + x;
        const dstY = dy + y;
        if (dstX >= 0 && dstX < this.canvas.width && dstY >= 0 && dstY < this.canvas.height) {
          const srcIdx = (y * imageData.width + x) * 4;
          const dstIdx = (dstY * this.canvas.width + dstX) * 4;
          this.pixels[dstIdx] = imageData.data[srcIdx];
          this.pixels[dstIdx + 1] = imageData.data[srcIdx + 1];
          this.pixels[dstIdx + 2] = imageData.data[srcIdx + 2];
          this.pixels[dstIdx + 3] = imageData.data[srcIdx + 3];
        }
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = this.parseColor(this.fillStyle);
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (px >= 0 && px < this.canvas.width && py >= 0 && py < this.canvas.height) {
          const idx = (py * this.canvas.width + px) * 4;
          this.pixels[idx] = r;
          this.pixels[idx + 1] = g;
          this.pixels[idx + 2] = b;
          this.pixels[idx + 3] = a;
        }
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (px >= 0 && px < this.canvas.width && py >= 0 && py < this.canvas.height) {
          const idx = (py * this.canvas.width + px) * 4;
          this.pixels[idx] = 0;
          this.pixels[idx + 1] = 0;
          this.pixels[idx + 2] = 0;
          this.pixels[idx + 3] = 0;
        }
      }
    }
  }

  drawImage() {}
  fillText() {}
  measureText() { return { width: 0 }; }
  save() {}
  restore() {}
  scale() {}
  translate() {}
  rotate() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  rect() {}
  clip() {}
  setTransform() {}
  resetTransform() {}
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
}

class CanvasPolyfill {
  width: number;
  height: number;
  style: any = {};
  private context: CanvasRenderingContext2DPolyfill;

  constructor(width = 160, height = 144) {
    this.width = width;
    this.height = height;
    this.context = new CanvasRenderingContext2DPolyfill(this);
  }

  getContext(type: string) {
    if (type === "2d") {
      return this.context;
    }
    return null;
  }

  toDataURL() { return ""; }
  toBlob() {}
  addEventListener() {}
  removeEventListener() {}
}

// Polyfill document with proper canvas support
if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === "canvas") {
        return new CanvasPolyfill();
      }
      return { style: {}, appendChild: () => {}, addEventListener: () => {} };
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
      style: {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

// Also export as function for explicit calls
export function applyPolyfills() {
  // Already applied above, this is a no-op for compatibility
}
