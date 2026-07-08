// Bitrix24 invokes placement handlers (and the install-time UI load) via POST with auth
// params in the body - but this is a Nuxt page, which only renders on GET. The B24Frame SDK
// gets its auth via a postMessage handshake with the parent window once the page loads
// client-side, not from this POST body, so a plain redirect to the GET page is sufficient.
export default defineEventHandler((event) => {
  return sendRedirect(event, '/lead-detail', 302);
});
