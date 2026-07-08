<script setup lang="ts">
// Bitrix24 appears to load the app's root URL as part of the install/open flow
// (separate from the CRM_LEAD_DETAIL_TAB placement, which points at /lead-detail).
// A 404 here seems to block Bitrix from proceeding to the real install call.
</script>

<template>
  <div class="p-8 text-center">
    <h1 class="text-lg font-medium">WABA Outreach</h1>
    <p class="text-sm text-gray-500 mt-2">Open a Lead in Bitrix24 to send WhatsApp material.</p>
  </div>
</template>
