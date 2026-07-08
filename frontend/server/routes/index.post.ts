// If the Local App's configured install handler URL points at the frontend's root
// (rather than the backend directly), forward the real ONAPPINSTALL POST body to the
// backend's actual install endpoint so the OAuth token still gets stored either way.
export default defineEventHandler(async (event) => {
  const body = await readRawBody(event);
  const contentType = getRequestHeader(event, 'content-type') || 'application/x-www-form-urlencoded';
  const backendUrl = useRuntimeConfig().public.backendUrl;

  try {
    const response = await $fetch.raw(`${backendUrl}/api/bitrix/install`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });
    setResponseStatus(event, response.status);
    return response._data;
  } catch (err: any) {
    setResponseStatus(event, err.response?.status || 500);
    return err.response?._data || 'Install forwarding failed';
  }
});
