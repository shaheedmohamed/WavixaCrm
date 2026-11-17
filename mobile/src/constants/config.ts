export const Config = {
  // Production CRM API endpoint
  API_BASE_URL: 'https://crm.wavixa.net/api',
  CRM_BASE_URL: 'https://crm.wavixa.net',

  // Media stream URLs with token
  getMediaUrl: (mediaId: number | string, token: string, download = false) =>
    `https://crm.wavixa.net/api/crm/media/${mediaId}?token=${encodeURIComponent(token)}${download ? '&download=1' : ''}`,

  getAvatarUrl: (convId: number | string, token: string, download = false) =>
    `https://crm.wavixa.net/api/crm/avatar/${convId}?token=${encodeURIComponent(token)}${download ? '&download=1' : ''}`,

  // App Metadata
  appName: 'Wavixa CRM',
  appVersion: '1.0.0',
};
