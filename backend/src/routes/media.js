const express = require('express');
const httpClient = require('../lib/httpClient');
const mediaTokens = require('../store/mediaTokens');
const { callMethodWithToken } = require('../bitrix/client');

const router = express.Router();

// disk.file.get's DOWNLOAD_URL should always point at the customer's own Bitrix24 cloud
// domain (whatever regional TLD - .com, .de, .eu, etc.) - refuse to blindly proxy/stream
// an unexpected host through this backend's own domain (open-relay-adjacent risk) and
// refuse an unexpected content-type before piping it into a WhatsApp template header.
const ALLOWED_DOWNLOAD_HOST_PATTERN = /(^|\.)bitrix24\.[a-z.]+$/i;
const ALLOWED_CONTENT_TYPE_PREFIXES = ['application/pdf', 'video/', 'image/', 'application/octet-stream', 'application/msword', 'application/vnd'];

function isAllowedDownloadUrl(urlString) {
  try {
    const { hostname, protocol } = new URL(urlString);
    return protocol === 'https:' && ALLOWED_DOWNLOAD_HOST_PATTERN.test(hostname);
  } catch {
    return false;
  }
}

function isAllowedContentType(contentType) {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

router.get('/:token', async (req, res) => {
  const token = req.params.token;
  const data = mediaTokens.resolveToken(token);

  if (!data) {
    return res.status(410).send('Link expired or invalid.');
  }

  try {
    // 1. Fetch the DOWNLOAD_URL from Bitrix24, using the caller's own live access token
    // (captured at send time) rather than the backend's persisted install-level admin
    // token - that token lives in tokens.json, which doesn't survive a redeploy without
    // a mounted volume, silently breaking every file download until manually reinstalled.
    const fileResp = await callMethodWithToken(data.domain, 'disk.file.get', { id: data.fileId }, data.accessToken);
    const downloadUrl = fileResp.result?.DOWNLOAD_URL;

    if (!downloadUrl) {
      return res.status(404).send('File not found in Drive.');
    }

    if (!isAllowedDownloadUrl(downloadUrl)) {
      req.log.error({ token }, '[media proxy] refusing to proxy unexpected download host');
      return res.status(502).send('Unexpected file host.');
    }

    // 2. Proxy the download. DOWNLOAD_URL from disk.file.get is already self-signed
    // (embeds its own auth+token query params) - do not add our own auth param, it
    // collides with the URL's signed token and breaks the download. Longer timeout than
    // the shared client's default - this streams brochures/videos, which can take longer
    // than a typical JSON API round-trip.
    const response = await httpClient({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 60000,
    });

    const contentType = response.headers['content-type'];
    if (!isAllowedContentType(contentType)) {
      response.data.destroy();
      req.log.error({ token, contentType }, '[media proxy] refusing to proxy unexpected content-type');
      return res.status(502).send('Unexpected file type.');
    }

    // Pass along headers like content-type and content-length
    res.set({
      'Content-Type': contentType,
      'Content-Length': response.headers['content-length'],
      'Content-Disposition': `attachment; filename="${encodeURIComponent(data.filename)}"`
    });

    response.data.pipe(res);
  } catch (err) {
    req.log.error({ token, err }, '[media proxy] error');
    res.status(500).send('Error retrieving media file.');
  }
});

module.exports = router;
