const axios = require('axios');

// Every outbound call (Bitrix REST, OnCloud API, Drive file downloads) previously had no
// timeout at all and could hang indefinitely on a flaky upstream, tying up the request.
// One shared instance so every module gets this by default instead of each hand-rolling it.
const httpClient = axios.create({ timeout: 15000 });

module.exports = httpClient;
