const express = require('express');
const axios = require('axios');
const mediaTokens = require('../store/mediaTokens');
const { getValidAuth } = require('../bitrix/auth');
const { callMethod } = require('../bitrix/client');

const router = express.Router();

router.get('/:token', async (req, res) => {
  const token = req.params.token;
  const data = mediaTokens.resolveToken(token);

  if (!data) {
    return res.status(410).send('Link expired or invalid.');
  }

  try {
    // 1. Get the app's valid admin token for the domain
    const auth = await getValidAuth(data.domain);
    
    // 2. Fetch the DOWNLOAD_URL from Bitrix24
    const fileResp = await callMethod(data.domain, 'disk.file.get', { id: data.fileId });
    const downloadUrl = fileResp.result?.DOWNLOAD_URL;

    if (!downloadUrl) {
      return res.status(404).send('File not found in Drive.');
    }

    // 3. Proxy the download, passing the auth token to bypass cookie requirement
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      params: { auth: auth.accessToken },
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
