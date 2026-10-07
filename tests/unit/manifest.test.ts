import { describe, expect, it } from 'vitest';
import manifest from '../../manifest.json';

/**
 * Spec §7 rule 3 and CLAUDE.md rule 2: the permission set is a contract, and a
 * change to it needs explicit approval. This suite is where that approval has
 * to show up — widening the manifest means editing an assertion here, in the
 * same diff, where a reviewer cannot miss it.
 */

const YOUTUBE = 'https://www.youtube.com/*';

describe('manifest', () => {
  it('requests exactly storage and alarms', () => {
    expect([...manifest.permissions].sort()).toEqual(['alarms', 'storage']);
  });

  it('reaches exactly one host', () => {
    expect(manifest.host_permissions).toEqual([YOUTUBE]);
  });

  it('has no optional permissions to grow into later', () => {
    expect(manifest).not.toHaveProperty('optional_permissions');
    expect(manifest).not.toHaveProperty('optional_host_permissions');
  });

  it('injects only into top-level youtube.com frames', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    const [script] = manifest.content_scripts;
    expect(script?.matches).toEqual([YOUTUBE]);
    expect(script?.all_frames).toBe(false);
  });

  it('keeps the extension-page CSP at the spec value', () => {
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
    });
  });

  it('exposes nothing to web pages and phones nowhere home', () => {
    // web_accessible_resources would let any page probe for the extension;
    // externally_connectable would let one message it; update_url is an
    // update check against a server, which §7 rule 4 forbids.
    for (const key of ['web_accessible_resources', 'externally_connectable', 'update_url', 'sandbox']) {
      expect(manifest).not.toHaveProperty(key);
    }
  });
});
