export const Config = {
  // Production CRM API endpoint
  API_BASE_URL: 'https://crm.wavixa.net/api',
  CRM_BASE_URL: 'https://crm.wavixa.net',

  // Media stream URLs with token
  getMediaUrl: (mediaId: number | string, token: string, download = false) =>
    `https://crm.wavixa.net/api/crm/media/${mediaId}?token=${encodeURIComponent(token)}${download ? '&download=1' : ''}`,

  getAvatarUrl: (convId: number | string, token: string, download = false, version?: string) =>
    `https://crm.wavixa.net/api/crm/avatar/${convId}?token=${encodeURIComponent(token)}${download ? '&download=1' : ''}${version ? `&v=${encodeURIComponent(version)}` : ''}`,

  // Group participant avatars — resolved + cached lazily by the backend.
  getSenderAvatarUrl: (sessionId: number | string, jid: string, token: string) =>
    `https://crm.wavixa.net/api/crm/sender-avatar?session_id=${encodeURIComponent(sessionId)}&jid=${encodeURIComponent(jid)}&token=${encodeURIComponent(token)}`,

  // ffmpeg-extracted first frame for stored video bubbles.
  getVideoThumbUrl: (messageId: number | string, token: string) =>
    `https://crm.wavixa.net/api/crm/video-thumb/${messageId}?token=${encodeURIComponent(token)}`,

  // Status (story) media — lazy-decrypts through the engine like /crm/media.
  getStatusMediaUrl: (statusId: number | string, token: string) =>
    `https://crm.wavixa.net/api/crm/status-media/${statusId}?token=${encodeURIComponent(token)}`,

  // App Metadata
  appName: 'CareBot',
  appVersion: '1.0.3',
};
