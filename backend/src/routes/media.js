const express = require('express');
const axios = require('axios');
const mediaTokens = require('../store/mediaTokens');
const { callMethodWithToken } = require('../bitrix/client');

const router = express.Router();

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

    // 2. Proxy the download. DOWNLOAD_URL from disk.file.get is already self-signed
    // (embeds its own auth+token query params) - do not add our own auth param, it
    // collides with the URL's signed token and breaks the download.
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    // Pass along headers like content-type and content-length
    res.set({
      'Content-Type': response.headers['content-type'],
      'Content-Length': response.headers['content-length'],
      'Content-Disposition': `attachment; filename="${encodeURIComponent(data.filename)}"`
    });

    response.data.pipe(res);
  } catch (err) {
    console.error(`[media proxy] error for token ${token}:`, err.message);
    res.status(500).send('Error retrieving media file.');
  }
});

module.exports = router;
