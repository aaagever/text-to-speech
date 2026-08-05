import { describe, it, expect } from "vitest";
import { buildWav, pcm16ToFloat32 } from "./audio";

function ascii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("buildWav header", () => {
  it("writes a valid 16-bit mono PCM WAV header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const view = new DataView(buildWav(samples, 24000));

    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // fmt length
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint32(28, true)).toBe(24000 * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("clamps and quantizes samples to int16", () => {
    const view = new DataView(buildWav(new Float32Array([1, -1, 2, -2]), 8000));
    expect(view.getInt16(44, true)).toBe(0x7fff); // +1 -> max
    expect(view.getInt16(46, true)).toBe(-0x8000); // -1 -> min
    expect(view.getInt16(48, true)).toBe(0x7fff); // +2 clamped
    expect(view.getInt16(50, true)).toBe(-0x8000); // -2 clamped
  });
});

describe("pcm16ToFloat32", () => {
  it("normalizes little-endian int16 samples to [-1, 1)", () => {
    const buf = new ArrayBuffer(6);
    const dv = new DataView(buf);
    dv.setInt16(0, 0, true);
    dv.setInt16(2, 0x4000, true); // 0.5
    dv.setInt16(4, -0x8000, true); // -1
    const out = pcm16ToFloat32(buf);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(-1);
  });

  it("ignores a trailing odd byte", () => {
    expect(pcm16ToFloat32(new ArrayBuffer(5)).length).toBe(2);
  });
});
