/**
 * Prüfung hochgeladener Bilder (FA-STAMM-05, NFA-SEC-15).
 */
import { describe, expect, it } from 'vitest';

import {
  containsActiveSvgContent,
  detectImageType,
  extensionForImageType,
  MAX_LOGO_BYTES,
  validateImageUpload,
} from '@/domain/assets/image-upload';
import { isErr, unwrap } from '@/domain/shared/result';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function svg(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}

const PLAIN_SVG = svg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');

describe('Typerkennung über die Signatur', () => {
  it('erkennt PNG und JPEG an den ersten Bytes', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPEG)).toBe('image/jpeg');
  });

  it('erkennt SVG am Dokumentbeginn, auch mit XML-Deklaration und BOM', () => {
    expect(detectImageType(PLAIN_SVG)).toBe('image/svg+xml');
    expect(detectImageType(svg('<?xml version="1.0"?><svg></svg>'))).toBe('image/svg+xml');
    expect(detectImageType(svg('﻿  <svg></svg>'))).toBe('image/svg+xml');
  });

  it('meldet unbekannten Inhalt', () => {
    expect(detectImageType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(detectImageType(svg('nur text'))).toBeNull();
  });

  it('liefert die passende Dateiendung', () => {
    expect(extensionForImageType('image/png')).toBe('png');
    expect(extensionForImageType('image/jpeg')).toBe('jpg');
    expect(extensionForImageType('image/svg+xml')).toBe('svg');
  });
});

describe('Upload-Prüfung (NFA-SEC-15)', () => {
  it('nimmt gültige Dateien an', () => {
    expect(unwrap(validateImageUpload(PNG, 'image/png')).type).toBe('image/png');
    expect(unwrap(validateImageUpload(JPEG, 'image/jpeg')).type).toBe('image/jpeg');
    expect(unwrap(validateImageUpload(PLAIN_SVG, 'image/svg+xml')).type).toBe('image/svg+xml');
  });

  it('akzeptiert auch ohne gemeldeten Typ, wenn der Inhalt stimmt', () => {
    expect(unwrap(validateImageUpload(PNG, '')).type).toBe('image/png');
  });

  it('lehnt leere Dateien ab', () => {
    const result = validateImageUpload(new Uint8Array(0), 'image/png');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('EMPTY');
    }
  });

  it('lehnt zu große Dateien ab', () => {
    const oversized = new Uint8Array(MAX_LOGO_BYTES + 1);
    oversized.set(PNG.subarray(0, 8));
    const result = validateImageUpload(oversized, 'image/png');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('TOO_LARGE');
    }
  });

  it('lehnt Dateien ab, deren Inhalt nicht zum gemeldeten Typ passt', () => {
    // Eine SVG-Datei, die sich als PNG ausgibt — der gemeldete Typ ist eine
    // Behauptung des Clients, die Signatur nicht.
    const result = validateImageUpload(PLAIN_SVG, 'image/png');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('TYPE_MISMATCH');
    }
  });

  it('lehnt Inhalte ohne erkennbare Signatur ab', () => {
    const result = validateImageUpload(new TextEncoder().encode('<html>kein Bild</html>'), '');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('UNRECOGNIZED_CONTENT');
    }
  });

  it('nimmt einen gemeldeten Typ mit Parametern an', () => {
    expect(unwrap(validateImageUpload(PNG, 'image/png; charset=binary')).type).toBe('image/png');
  });

  it('berücksichtigt eine abweichende Größengrenze', () => {
    const result = validateImageUpload(PNG, 'image/png', 4);
    expect(isErr(result)).toBe(true);
  });
});

describe('SVG mit ausführbaren Bestandteilen (A7)', () => {
  it('erkennt Skript-Elemente, Ereignisattribute und javascript-URIs', () => {
    for (const body of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><a href="javascript:alert(1)">x</a></svg>',
      '<svg><foreignObject><body/></foreignObject></svg>',
      '<svg><rect ONMOUSEOVER="x"/></svg>',
    ]) {
      expect(containsActiveSvgContent(svg(body)), body).toBe(true);
    }
  });

  it('lässt eine harmlose Grafik durch', () => {
    expect(containsActiveSvgContent(PLAIN_SVG)).toBe(false);
  });

  it('lehnt eine SVG-Datei mit Skript beim Upload ab', () => {
    const result = validateImageUpload(svg('<svg><script>alert(1)</script></svg>'), 'image/svg+xml');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ACTIVE_CONTENT');
    }
  });
});
