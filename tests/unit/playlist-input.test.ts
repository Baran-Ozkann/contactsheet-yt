import { describe, expect, it } from 'vitest';
import { parsePlaylistInput } from '../../src/core/playlist-input.js';

describe('parsePlaylistInput', () => {
  it('reads a playlist url', () => {
    expect(parsePlaylistInput('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
  });

  it('reads the list param out of a watch url', () => {
    expect(
      parsePlaylistInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&index=2'),
    ).toBe('PLabc123');
  });

  it('accepts a url without a scheme', () => {
    expect(parsePlaylistInput('youtube.com/playlist?list=WL')).toBe('WL');
  });

  it('accepts the mobile host', () => {
    expect(parsePlaylistInput('https://m.youtube.com/playlist?list=LL')).toBe('LL');
  });

  it('accepts a bare id', () => {
    expect(parsePlaylistInput('  PLabc123  ')).toBe('PLabc123');
  });

  it('rejects a playlist name typed as free text', () => {
    expect(parsePlaylistInput('Daha sonra izle')).toBeNull();
  });

  it('rejects other sites', () => {
    expect(parsePlaylistInput('https://evil.example/playlist?list=PLabc123')).toBeNull();
  });

  it('rejects a url with no list param', () => {
    expect(parsePlaylistInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('rejects empty and malformed input', () => {
    expect(parsePlaylistInput('')).toBeNull();
    expect(parsePlaylistInput('   ')).toBeNull();
    expect(parsePlaylistInput('http://')).toBeNull();
  });
});
