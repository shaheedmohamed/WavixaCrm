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
  is_group?: boolean;
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
  resolved_by?: number | null;
  transferred_by?: number | null;
  last_outgoing_user_id?: number | null;
  rating?: number | null;
  rating_note?: string | null;
  session?: SessionDevice | null;
  assigned_agent?: { id: number; name: string } | null;
  transferred_by_user?: { id: number; name: string } | null;
  transferred_by_agent?: { id: number; name: string } | null;
  resolved_by_agent?: { id: number; name: string } | null;
  last_outgoing_user?: { id: number; name: string } | null;
  // Live "يكتب الآن…" flag — `by` carries the typer's name in groups.
  typing?: { by?: string | null } | null;
  // Peer presence pushed by the engine — drives the "متصل الآن" badge.
  presence?: 'available' | 'unavailable' | null;
  last_seen_at?: string | null;
  // Snoozed chats hide from normal tabs until this timestamp passes.
  snoozed_until?: string | null;
  snoozed_by?: number | null;
}

export interface ConversationNote {
  id: number;
  body: string;
  created_at?: string | null;
  author?: { id: number; name: string } | null;
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

// A resolved @mention — backend decorateMentions() maps the raw JID onto
// the contact-book/pushname name and the PN digits.
export interface MentionRef {
  jid: string;
  phone?: string | null;
  name?: string | null;
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
  mentions?: MentionRef[] | null;
  is_forwarded?: boolean;
  timestamp: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  created_at?: string | null;
  reply_to_id?: string | null;
  starred_at?: string | null;
  starred_by_user_id?: number | null;
  starred_by?: { id: number; name: string } | null;
  sent_by_user_id?: number | null;
  sent_by?: { id: number; name: string } | null;
  revoked_at?: string | null;
  edited_at?: string | null;
  is_view_once?: boolean | null;
  payload?: {
    poll?: { name: string; options: string[]; selectableCount: number } | null;
    event?: {
      name: string;
      description?: string;
      startTime?: number;
      endTime?: number;
      isCanceled?: boolean;
      locationName?: string;
    } | null;
    invite?: {
      groupName?: string;
      caption?: string;
      inviteCode?: string;
      inviteExpiration?: number;
    } | null;
  } | null;
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
  color?: string | null;
  conversation_ids: number[];
}

export interface StarredMessageItem {
  id: number;
  message_id?: string | null;
  conversation_id: number;
  message?: string | null;
  message_type: string;
  media_caption?: string | null;
  direction: 'incoming' | 'outgoing';
  sender_name?: string | null;
  timestamp?: string | null;
  starred_at?: string | null;
  starred_by?: { id: number; name: string } | null;
  conversation?: Conversation | null;
}

export interface QuickReply {
  id: number;
  shortcut: string;
  message: string;
  is_shared?: boolean;
  owner_id?: number;
  owner_name?: string | null;
  mine?: boolean;
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
  | 'waiting'
  | 'snoozed'
  | 'resolved'
  | 'archived'
  | 'all'
  | `list:${number}`;

export interface GroupMember {
  jid: string;
  phone?: string | null;
  lid?: string | null;
  name?: string | null;
  admin?: boolean;
  superadmin?: boolean;
}

export interface GroupPastMember {
  jid: string;
  phone?: string | null;
  lid?: string | null;
  name?: string | null;
  leave_reason?: number;
  leave_ts?: number;
}

export interface GroupMembersResponse {
  success: boolean;
  subject?: string;
  owner?: string | null;
  created_at?: number | null;
  announce?: boolean | null;
  restrict?: boolean | null;
  members: GroupMember[];
  past: GroupPastMember[];
}

// WhatsApp Status / story — one ring segment in the viewer.
export interface StatusItem {
  id: number;
  poster_phone?: string | null;
  poster_name?: string | null;
  poster_avatar?: string | null;
  is_mine: boolean;
  type: 'text' | 'image' | 'video' | 'audio' | string;
  body?: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  has_lazy_media?: boolean;
  posted_at?: string | null;
  expires_at?: string | null;
  deleted_at?: string | null;
  viewed_at?: string | null;
}

// One contact's ring — ordered newest-first like the backend returns.
// Archived groups ship with items: [] and lazy-load on open.
export interface StatusGroup {
  poster_phone: string;
  poster_name?: string | null;
  poster_avatar?: string | null;
  count: number;
  unseen_count?: number;
  has_deleted?: boolean;
  latest_at?: string | null;
  items: StatusItem[];
  has_more?: boolean;
}

export interface StatusesResponse {
  success: boolean;
  mine: StatusItem[];
  mine_has_more?: boolean;
  recent: StatusGroup[];
  viewed: StatusGroup[];
}

export interface StatusItemsResponse {
  success: boolean;
  items: StatusItem[];
}
