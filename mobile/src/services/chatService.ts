import { apiClient } from './api';
import { Conversation, Message, PinnedPreview, Agent, QuickReply, SessionDevice } from '../types/crm';

export interface ConversationsParams {
  scope?: string;
  unread_only?: boolean;
  groups_only?: boolean;
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

  async getMessages(conversationId: number, options: { before_id?: number; after_id?: number; limit?: number } = {}) {
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

  async sendMedia(conversationId: number, fileUri: string, mimeType: string, caption?: string) {
    const formData = new FormData();
    formData.append('conversation_id', String(conversationId));
    if (caption) formData.append('caption', caption);

    const filename = fileUri.split('/').pop() || 'upload.jpg';
    // @ts-ignore React Native file object
    formData.append('file', {
      uri: fileUri,
      name: filename,
      type: mimeType,
    });

    const response = await apiClient.post('/crm/messages/send-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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
    return response.data;
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

  async archiveConversation(conversationId: number, archived: boolean = true) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/archive`, { archived });
    return response.data;
  },

  async pinConversation(conversationId: number, pinned: boolean = true) {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/pin-chat`, { pinned });
    return response.data;
  },
};
