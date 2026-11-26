import { apiClient } from './api';
import {
  Conversation,
  Message,
  PinnedPreview,
  Agent,
  QuickReply,
  SessionDevice,
  ChatList,
  MediaEditSpec,
  StarredMessageItem,
  GroupMembersResponse,
  StatusesResponse,
  StatusItemsResponse,
  ConversationNote,
} from '../types/crm';

export interface ConversationsParams {
  scope?: string;
  unread_only?: boolean;
  groups_only?: boolean;
  include_groups?: boolean;
  archived?: boolean;
  session_id?: number;
  search?: string;
  per_page?: number;
  page?: number;
}

export interface MessagesResponse {
  success: boolean;
  conversation: Conversation;
  messages: Message[];
  pinned?: PinnedPreview | null;
  // Live "يكتب الآن…" flag — `by` carries the typer's name in groups.
  typing?: { by?: string | null } | null;
  has_more?: boolean;
  has_newer?: boolean;
}

export const chatService = {
  async getConversations(params: ConversationsParams = {}) {
    const queryParams: Record<string, any> = {};

    if (params.scope && params.scope !== 'all') {
      queryParams.scope = params.scope;
    }
    if (params.unread_only) {
      queryParams.unread_only = 1;
    }
    if (params.groups_only) {
      queryParams.groups_only = 1;
    }
    if (params.include_groups) {
      queryParams.include_groups = 1;
    }
    if (params.archived) {
      queryParams.archived = 1;
    }
    if (params.session_id) {
      queryParams.session_id = params.session_id;
    }
    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.per_page) {
      queryParams.per_page = params.per_page;
    }
    if (params.page) {
      queryParams.page = params.page;
    }

    const response = await apiClient.get<{
      success: boolean;
      conversations: Conversation[];
      pagination: { current_page: number; last_page: number; total: number };
    }>('/crm/conversations', { params: queryParams });

    return response.data;
  },

  async getMessages(
    conversationId: number,
    options: { before_id?: number; after_id?: number; around_id?: number | string; limit?: number; peek?: boolean } = {}
  ) {
    const response = await apiClient.get<MessagesResponse>(`/crm/conversations/${conversationId}/messages`, {
      params: options,
    });
    return response.data;
  },

  async sendMessage(conversationId: number, message: string, replyToId?: string | null, sessionId?: number) {
    const payload: Record<string, any> = {
      conversation_id: conversationId,
      message,
    };
    if (replyToId) payload.reply_to_id = replyToId;
    if (sessionId) payload.session_id = sessionId;

    const response = await apiClient.post('/crm/messages/send', payload);
    return response.data;
  },

  async sendMedia(
    conversationId: number,
    file: { uri: string; name?: string; mimeType?: string },
    type: 'image' | 'video' | 'audio' | 'voice' | 'document',
    options: {
      caption?: string;
      sessionId?: number;
      replyToId?: string | null;
      editSpec?: MediaEditSpec | null;
      onUploadProgress?: (percent: number) => void;
    } = {}
  ) {
    const formData = new FormData();
    formData.append('conversation_id', String(conversationId));
    formData.append('type', type);
    if (options.caption) formData.append('caption', options.caption);
    if (options.sessionId) formData.append('session_id', String(options.sessionId));
    if (options.replyToId) formData.append('reply_to_id', options.replyToId);
    if (options.editSpec) formData.append('edit_spec', JSON.stringify(options.editSpec));

    const filename = file.name || file.uri.split('/').pop() || (type === 'image' ? 'photo.jpg' : type === 'video' ? 'video.mp4' : 'upload.bin');
    let mime = file.mimeType;
    if (!mime || mime === 'application/octet-stream') {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      else if (ext === 'png') mime = 'image/png';
      else if (ext === 'webp') mime = 'image/webp';
      else if (ext === 'mp4') mime = 'video/mp4';
      else if (ext === 'mov') mime = 'video/quicktime';
      else if (ext === 'm4a') mime = 'audio/m4a';
      else if (ext === 'ogg' || ext === 'opus') mime = 'audio/ogg';
      else if (ext === 'mp3') mime = 'audio/mpeg';
      else if (ext === 'pdf') mime = 'application/pdf';
      else if (type === 'image') mime = 'image/jpeg';
      else if (type === 'video') mime = 'video/mp4';
      else if (type === 'audio' || type === 'voice') mime = 'audio/m4a';
      else mime = 'application/octet-stream';
    }

    // @ts-ignore React Native file object
    formData.append('file', {
      uri: file.uri,
      name: filename,
      type: mime,
    });

    const response = await apiClient.post('/crm/messages/send-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 180000,
      onUploadProgress: (progressEvent) => {
        if (!options.onUploadProgress) return;
        const total = progressEvent.total || 0;
        if (total > 0) {
          const pct = Math.min(99, Math.max(1, Math.round((progressEvent.loaded * 100) / total)));
          options.onUploadProgress(pct);
        }
      },
    });
    options.onUploadProgress?.(100);
    return response.data;
  },

  async getConversationMedia(conversationId: number, limit: number = 60) {
    const response = await apiClient.get<{ success: boolean; media: Message[] }>(
      `/crm/conversations/${conversationId}/media`,
      { params: { limit } }
    );
    return response.data;
  },

  async getGroupMembers(conversationId: number): Promise<GroupMembersResponse> {
    const response = await apiClient.get<GroupMembersResponse>(
      `/crm/conversations/${conversationId}/members`
    );
    return response.data;
  },

  async renameConversation(conversationId: number, contactName: string) {
    const response = await apiClient.put(`/crm/conversations/${conversationId}`, {
      name: contactName,
    });
    return response.data;
  },

  async getChatLists(): Promise<{ success: boolean; lists: ChatList[] }> {
    const response = await apiClient.get('/crm/chat-lists');
    return response.data;
  },

  async saveChatList(payload: {
    id?: number;
    name: string;
    color?: string | null;
    conversation_ids?: number[];
  }): Promise<{ success: boolean; list: ChatList }> {
    const response = await apiClient.post('/crm/chat-lists', payload);
    return response.data;
  },

  async deleteChatList(id: number): Promise<{ success: boolean }> {
    const response = await apiClient.delete(`/crm/chat-lists/${id}`);
    return response.data;
  },

  async removeChatListMembers(id: number, conversationIds: number[]): Promise<{ success: boolean }> {
    const response = await apiClient.post(`/crm/chat-lists/${id}/remove-members`, {
      conversation_ids: conversationIds,
    });
    return response.data;
  },

  // Snooze — park the chat until the timer expires, then it resurfaces alone.
  async snoozeConversation(conversationId: number, payload: { minutes?: number; until?: string } = {}) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/snooze`, payload);
    return response.data;
  },

  async unsnoozeConversation(conversationId: number) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/unsnooze`);
    return response.data;
  },

  // Internal team notes — shift handover, visible to the whole team.
  async getNotes(conversationId: number): Promise<{ success: boolean; notes: ConversationNote[] }> {
    const response = await apiClient.get(`/crm/conversations/${conversationId}/notes`);
    return response.data;
  },

  async addNote(conversationId: number, body: string): Promise<{ success: boolean; note: ConversationNote }> {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/notes`, { body });
    return response.data;
  },

  async deleteNote(noteId: number): Promise<{ success: boolean }> {
    const response = await apiClient.delete(`/crm/notes/${noteId}`);
    return response.data;
  },

  async archiveConversation(conversationId: number, archived: boolean = true) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/archive`, {
      archived,
    });
    return response.data;
  },

  async pinConversation(conversationId: number, pinned: boolean = true) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/pin-chat`, {
      pinned,
    });
    return response.data;
  },

  async forwardMessage(messageId: string | number, targetConversationIds: number[]) {
    const response = await apiClient.post('/crm/messages/forward', {
      message_id: messageId,
      target_conversation_ids: targetConversationIds,
    });
    return response.data;
  },

  async sendReaction(conversationId: number, messageId: string | number, emoji: string | null) {
    const response = await apiClient.post('/crm/messages/reaction', {
      conversation_id: conversationId,
      message_id: messageId,
      emoji: emoji || '',
    });
    return response.data;
  },

  async claimConversation(conversationId: number) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/claim`);
    return response.data;
  },

  async resolveConversation(conversationId: number, rating?: number, ratingNote?: string) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/resolve`, {
      rating,
      rating_note: ratingNote,
    });
    return response.data;
  },

  async reopenConversation(conversationId: number) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/reopen`);
    return response.data;
  },

  async transferConversation(conversationId: number, targetAgentId: number, note?: string) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/transfer`, {
      agent_id: targetAgentId,
      note,
    });
    return response.data;
  },

  async pinMessage(messageId: number, duration: number = 604800) {
    const response = await apiClient.post(`/crm/messages/${messageId}/pin`, { duration });
    return response.data;
  },

  async unpinMessage(conversationId: number) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/unpin`);
    return response.data;
  },

  async toggleStar(messageId: number) {
    const response = await apiClient.post(`/crm/messages/${messageId}/star`);
    return response.data;
  },

  async getStarredMessages() {
    const response = await apiClient.get('/crm/starred-messages');
    return response.data;
  },

  async getStatuses() {
    const response = await apiClient.get<StatusesResponse>('/crm/statuses');
    return response.data;
  },

  // Full story list for one poster — archived/truncated rings lazy-load
  // through here; pass { mine: true } for the owner's own stories.
  async getStatusItems(opts: { poster_phone?: string; mine?: boolean }) {
    const response = await apiClient.get<StatusItemsResponse>('/crm/statuses/items', {
      params: opts,
    });
    return response.data;
  },

  async viewStatus(id: number | string) {
    const response = await apiClient.post(`/crm/statuses/${id}/view`);
    return response.data;
  },

  async searchMessages(q: string) {
    const response = await apiClient.get<{ success: boolean; messages: StarredMessageItem[] }>(
      '/crm/search/messages',
      { params: { q } }
    );
    return response.data;
  },

  async deleteMessage(messageId: string | number, conversationId: number, forEveryone: boolean = false) {
    const response = await apiClient.post('/crm/messages/delete', {
      message_id: messageId,
      conversation_id: conversationId,
      for_everyone: forEveryone,
    });
    return response.data;
  },

  async getAgents(): Promise<{ success: boolean; agents: Agent[] }> {
    const response = await apiClient.get('/crm/agents');
    return response.data;
  },

  async getQuickReplies(): Promise<{ success: boolean; quick_replies: QuickReply[] }> {
    const response = await apiClient.get('/crm/quick-replies');
    const raw = response.data?.replies || response.data?.quick_replies || [];
    const normalized: QuickReply[] = raw.map((r: any) => ({
      id: r.id,
      shortcut: r.shortcut || '',
      message: r.body || r.message || '',
      is_shared: Boolean(r.is_shared),
      owner_id: r.owner_id,
      owner_name: r.owner_name ?? null,
      mine: r.mine !== undefined ? Boolean(r.mine) : true,
    }));
    return {
      success: Boolean(response.data?.success),
      quick_replies: normalized,
    };
  },

  async saveQuickReply(payload: {
    id?: number;
    shortcut: string;
    body: string;
    is_shared: boolean;
  }): Promise<{ success: boolean }> {
    const response = await apiClient.post('/crm/quick-replies', payload);
    return { success: Boolean(response.data?.success) };
  },

  async deleteQuickReply(id: number): Promise<{ success: boolean }> {
    const response = await apiClient.delete(`/crm/quick-replies/${id}`);
    return { success: Boolean(response.data?.success) };
  },

  async getDevices(): Promise<{ success: boolean; devices: SessionDevice[] }> {
    const response = await apiClient.get('/crm/devices');
    return response.data;
  },

  async startConversation(phoneNumber: string, sessionId?: number, message?: string) {
    const response = await apiClient.post('/crm/conversations/new', {
      phone: phoneNumber,
      session_id: sessionId,
      message,
    });
    return response.data;
  },
};
