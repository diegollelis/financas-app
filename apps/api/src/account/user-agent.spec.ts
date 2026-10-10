import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent.js';

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      { browser: 'Chrome', os: 'Windows' },
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0',
      { browser: 'Edge', os: 'Windows' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
      { browser: 'Chrome', os: 'Android' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iOS' },
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0; rv:142.0) Gecko/20100101 Firefox/142.0',
      { browser: 'Firefox', os: 'macOS' },
    ],
  ])('names the browser and the system of %s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toEqual(expected);
  });

  it('says it does not know, without a user-agent', () => {
    expect(describeUserAgent(null)).toEqual({
      browser: 'Navegador desconhecido',
      os: 'Sistema desconhecido',
    });
  });
});
