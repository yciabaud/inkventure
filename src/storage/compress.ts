import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

// Saves are deflated then base64-encoded (SPEC §6.1). btoa/atob exist on every target browser.

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.prototype.slice.call(bytes, i, i + CHUNK) as number[],
    );
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function compressBytes(bytes: Uint8Array): string {
  return toBase64(deflateSync(bytes));
}

export function decompressBytes(text: string): Uint8Array {
  return inflateSync(fromBase64(text));
}

export function compressText(text: string): string {
  return compressBytes(strToU8(text));
}

export function decompressText(text: string): string {
  return strFromU8(decompressBytes(text));
}
