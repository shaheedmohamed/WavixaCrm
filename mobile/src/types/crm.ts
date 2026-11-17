export type CrmRole = 'owner' | 'admin' | 'agent';

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string | null;
  crm_role: CrmRole;
  crm_parent_id?: number | null;
  assigned_sessions?: number[];
  group_id?: number | null;
  group_name?: string | null;
  active_chats?: number | null;
  max_active_chats?: number | null;
}

export interface SessionDevice {
  id: number;
  device_name?: string | null;
  phone_number?: string | null;
  status?: string | null;
}

export interface Conversation {
  id: number;
  session_id: number;
  contact_jid: string;
  contact_phone?: string | null;
  contact_name?: string | null;
  contact_username?: string | null;
  contact_avatar?: string | null;
  is_pinned?: boolean;
  pinned_message_id?: number | null;
  pin_expires_at?: string | null;
  archived_at?: string | null;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_type?: string | null;
  last_message_direction?: 'incoming' | 'outgoing' | null;
  last_message_status?: 'pending' | 'sent' | 'delivered' | 'read' | null;
  assigned_agent_id?: number | null;
  assigned_at?: string | null;
  resolved_at?: string | null;
  transferred_by?: number | null;
  rating?: number | null;
  rating_note?: string | null;
  session?: SessionDevice | null;
  assigned_agent?: { id: number; name: string } | null;
  transferred_by_user?: { id: number; name: string } | null;
}

export interface PinnedPreview {
  id: number;
  message_id: string;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  message: string;
  sender_name?: string | null;
  expires_at?: string | null;
}

export interface MediaMeta {
  mediaKey?: string;
  directPath?: string;
  url?: string;
  mimetype?: string;
  fileName?: string;
  type?: string;
  seconds?: number;
}

export interface MessageReaction {
  emoji: string;
  from?: string;
  timestamp?: number;
}

export interface Message {
  id: number;
  message_id: string;
  conversation_id: number;
  direction: 'incoming' | 'outgoing';
  from?: string | null;
  to?: string | null;
  sender_name?: string | null;
  sender_phone?: string | null;
  message?: string | null;
  message_type: string;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_caption?: string | null;
  media_size?: number | null;
  media_meta?: MediaMeta | null;
  reactions?: MessageReaction[] | null;
  mentioned_jids?: string[] | null;
  is_forwarded?: boolean;
  timestamp: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  reply_to_id?: string | null;
  starred_at?: string | null;
  revoked_at?: string | null;
  local_uri?: string | null;
  upload_progress?: number | null;
  client_temp_id?: string | null;
  edit_spec?: MediaEditSpec | null;
  retry_payload?: {
    kind: 'text' | 'media';
    text?: string;
    replyToId?: string | null;
    file?: { uri: string; name?: string; mimeType?: string; size?: number };
    mediaType?: 'image' | 'video' | 'audio' | 'voice' | 'document';
    caption?: string;
    editSpec?: MediaEditSpec | null;
  } | null;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawStroke {
  color: string;
  widthRatio: number;
  points: [number, number][];
}

export interface TextOverlayItem {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  bgStyle: 'none' | 'dark' | 'solid';
  fontSizeRatio: number;
}

export interface MediaEditSpec {
  rotation?: number;
  crop?: CropRect;
  strokes?: DrawStroke[];
  texts?: TextOverlayItem[];
  trimStart?: number;
  trimEnd?: number;
  duration?: number;
  muteAudio?: boolean;
}

export interface ChatList {
  id: number;
  name: string;
  conversation_ids: number[];
}

export interface QuickReply {
  id: number;
  shortcut: string;
  message: string;
}

export interface Agent {
  id: number;
  name: string;
  email: string;
  crm_role: CrmRole;
  status?: string;
  active_chats?: number;
}

export type FilterScope =
  | 'chats'
  | 'groups'
  | 'mine'
  | 'unassigned'
  | 'unread'
  | 'favorites'
  | 'resolved'
  | 'archived'
  | 'all'
  | `list:${number}`;
