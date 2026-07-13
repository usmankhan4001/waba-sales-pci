// CJS interop: vi.mock's hoisting is designed around ESM import graphs and doesn't
// reliably intercept plain require() calls here, so tests spy directly on the shared
// module objects instead (Node's require cache means auth.js sees the same object
// this test mutates, since object property lookups happen at call time).
const tokenStore = require('../store/tokenStore');
const httpClient = require('../lib/httpClient');
const { getValidAuth, refreshAuth } = require('./auth');

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('bitrix/auth', () => {
  it('getValidAuth throws when no auth is stored for the domain', async () => {
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(undefined);
    await expect(getValidAuth('missing.bitrix24.com')).rejects.toThrow(/not installed/i);
  });

  it('getValidAuth returns the stored auth without refreshing when not near expiry', async () => {
    const auth = { domain: 'x.bitrix24.com', accessToken: 'tok', expiresAt: Date.now() + 3600_000 };
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(auth);
    const getSpy = vi.spyOn(httpClient, 'get');

    const result = await getValidAuth('x.bitrix24.com');

    expect(result).toBe(auth);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('getValidAuth refreshes when the token is within 60s of expiry', async () => {
    const auth = { domain: 'x.bitrix24.com', accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() + 1000 };
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(auth);
    const saveSpy = vi.spyOn(tokenStore, 'saveBitrixAuth').mockResolvedValue();
    const getSpy = vi
      .spyOn(httpClient, 'get')
      .mockResolvedValue({ data: { access_token: 'new', refresh_token: 'r2', expires_in: 3600 } });

    const result = await getValidAuth('x.bitrix24.com');

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('new');
    expect(saveSpy).toHaveBeenCalledWith('x.bitrix24.com', expect.objectContaining({ accessToken: 'new', refreshToken: 'r2' }));
  });

  it('refreshAuth throws if nothing is stored for the domain', async () => {
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(undefined);
    await expect(refreshAuth('missing.bitrix24.com')).rejects.toThrow(/no stored bitrix auth/i);
  });

  it('dedupes concurrent refreshAuth calls for the same domain into one HTTP request', async () => {
    const auth = { domain: 'x.bitrix24.com', accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() + 1000 };
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(auth);
    vi.spyOn(tokenStore, 'saveBitrixAuth').mockResolvedValue();
    let resolveHttp;
    const getSpy = vi.spyOn(httpClient, 'get').mockReturnValue(
      new Promise((resolve) => {
        resolveHttp = resolve;
      })
    );

    const p1 = refreshAuth('x.bitrix24.com');
    const p2 = refreshAuth('x.bitrix24.com');

    resolveHttp({ data: { access_token: 'new', refresh_token: 'r2', expires_in: 3600 } });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });
});
