import { describe, expect, it } from 'vitest';
import {
  extractClientConfig,
  extractJsonAfter,
  extractYtInitialData,
  matchBalancedObject,
} from '../../src/content/innertube.js';

describe('matchBalancedObject', () => {
  it('returns the whole object', () => {
    expect(matchBalancedObject('{"a":1}', 0)).toBe('{"a":1}');
  });

  it('stops at the matching brace, ignoring trailing script', () => {
    expect(matchBalancedObject('{"a":{"b":2}};var x=1;', 0)).toBe('{"a":{"b":2}}');
  });

  it('ignores braces inside string literals', () => {
    const src = '{"title":"a } b { c","n":1}';
    expect(matchBalancedObject(src, 0)).toBe(src);
  });

  it('ignores an escaped quote inside a string', () => {
    const src = '{"title":"she said \\"}\\" loudly","n":1}';
    expect(matchBalancedObject(src, 0)).toBe(src);
  });

  it('handles an escaped backslash right before the closing quote', () => {
    const src = '{"path":"C:\\\\","n":1}';
    expect(matchBalancedObject(src, 0)).toBe(src);
  });

  it('returns null when the object never closes', () => {
    expect(matchBalancedObject('{"a":1', 0)).toBeNull();
  });

  it('returns null when the start is not a brace', () => {
    expect(matchBalancedObject('x{"a":1}', 0)).toBeNull();
  });
});

describe('extractJsonAfter', () => {
  it('finds the object following a marker', () => {
    expect(extractJsonAfter('foo = {"a":1}; bar', 'foo =')).toEqual({ a: 1 });
  });

  it('returns undefined when the marker is absent', () => {
    expect(extractJsonAfter('nothing here', 'foo =')).toBeUndefined();
  });

  it('returns undefined when the payload is truncated', () => {
    expect(extractJsonAfter('foo = {"a":1', 'foo =')).toBeUndefined();
  });

  it('returns undefined for a payload that is not valid json', () => {
    expect(extractJsonAfter("foo = {a:1,}", 'foo =')).toBeUndefined();
  });
});

describe('extractYtInitialData', () => {
  const payload = '{"contents":{"n":1}}';

  it.each([
    ['var', `<script>var ytInitialData = ${payload};</script>`],
    ['window', `<script>window["ytInitialData"] = ${payload};</script>`],
    ['bare', `<script>ytInitialData = ${payload};</script>`],
  ])('reads the %s form', (_name, html) => {
    expect(extractYtInitialData(html)).toEqual({ contents: { n: 1 } });
  });

  it('survives a realistic document with other scripts around it', () => {
    const html = `<!doctype html><html><head><script>var ytcfg={"x":"{not json}"};</script>
      <script>var ytInitialData = ${payload};</script>
      <script>var ytInitialPlayerResponse = {"other":true};</script></head></html>`;
    expect(extractYtInitialData(html)).toEqual({ contents: { n: 1 } });
  });

  it('returns undefined when the document has no payload', () => {
    expect(extractYtInitialData('<html><body>signed out</body></html>')).toBeUndefined();
  });
});

describe('extractClientConfig', () => {
  const html =
    '{"INNERTUBE_API_KEY":"AIzaSyAO_Fake_Key_For_Tests_123","INNERTUBE_CLIENT_VERSION":"2.20260911.01.00"}';

  it('reads both values', () => {
    expect(extractClientConfig(html)).toEqual({
      apiKey: 'AIzaSyAO_Fake_Key_For_Tests_123',
      clientVersion: '2.20260911.01.00',
    });
  });

  it('returns null when either value is missing', () => {
    expect(extractClientConfig('{"INNERTUBE_API_KEY":"AIzaSyAO_Fake_Key_For_Tests_123"}')).toBeNull();
    expect(extractClientConfig('{"INNERTUBE_CLIENT_VERSION":"2.20260911.01.00"}')).toBeNull();
    expect(extractClientConfig('')).toBeNull();
  });

  it('rejects an implausibly short key rather than trusting it', () => {
    expect(
      extractClientConfig('{"INNERTUBE_API_KEY":"short","INNERTUBE_CLIENT_VERSION":"2.2026.01.00"}'),
    ).toBeNull();
  });
});
