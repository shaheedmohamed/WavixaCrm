/**
 * CRM Service
 * API client and session management for Wavixa WhatsApp CRM
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

class CrmService {
  constructor() {
    this.tokenKey = 'crm_auth_token';
    this.userKey = 'crm_auth_user';
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  getUser() {
    const raw = localStorage.getItem(this.userKey);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setUser(user) {
    if (user) {
      localStorage.setItem(this.userKey, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.userKey);
    }
  }

  setToken(token) {
    if (token) {
      localStorage.setItem(this.tokenKey, token);
    } else {
      localStorage.removeItem(this.tokenKey);
    }
  }

  isAuthenticated() {
    return Boolean(this.getToken() && this.getUser());
  }

  isOwner() {
    const user = this.getUser();
    return user && user.crm_role === 'owner';
  }

  isAgent() {
    const user = this.getUser();
    return user && user.crm_role === 'agent';
  }

  isAdmin() {
    const user = this.getUser();
    return user && user.crm_role === 'admin';
  }

  logout() {
    this.setToken(null);
    this.setUser(null);
  }

  client() {
    const token = this.getToken();
    return axios.create({
      baseURL: `${API_BASE}/crm`,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  async login(email, password) {
    const resp = await axios.post(`${API_BASE}/crm/auth/login`, { email, password });
    if (resp.data?.success && resp.data?.token) {
      this.setToken(resp.data.token);
      this.setUser(resp.data.user);
    }
    return resp.data;
  }

  async me() {
    const resp = await this.client().get('/me');
    if (resp.data?.user) {
      this.setUser(resp.data.user);
    }
    return resp.data;
  }

  async getStats() {
    const resp = await this.client().get('/stats');
    return resp.data;
  }

  // Devices
  async getDevices() {
    const resp = await this.client().get('/devices');
    return resp.data;
  }

  async initDevice(payload = {}) {
    const resp = await this.client().post('/devices/init', payload);
    return resp.data;
  }

  async getDeviceStatus(id) {
    const resp = await this.client().get(`/devices/${id}/status`);
    return resp.data;
  }

  async reconnectDevice(id) {
    const resp = await this.client().post(`/devices/${id}/reconnect`);
    return resp.data;
  }

  async updateDevice(id, data) {
    const resp = await this.client().put(`/devices/${id}`, data);
    return resp.data;
  }

  async disconnectDevice(id) {
    const resp = await this.client().post(`/devices/${id}/disconnect`);
    return resp.data;
  }

  async syncDeviceHistory(id) {
    const resp = await this.client().post(`/devices/${id}/sync-history`);
    return resp.data;
  }

  async getSyncStatus() {
    const resp = await this.client().get('/sync-status');
    return resp.data;
  }

  // Address book
  async getContacts(params = {}) {
    const resp = await this.client().get('/contacts', { params });
    return resp.data;
  }

  async addContact(data) {
    const resp = await this.client().post('/contacts', data);
    return resp.data;
  }

  async updateContact(id, data) {
    const resp = await this.client().put(`/contacts/${id}`, data);
    return resp.data;
  }

  async deleteContact(id) {
    const resp = await this.client().delete(`/contacts/${id}`);
    return resp.data;
  }

  async importContacts(formData) {
    const resp = await this.client().post('/contacts/import', formData);
    return resp.data;
  }

  async deleteDevice(id) {
    const resp = await this.client().delete(`/devices/${id}`);
    return resp.data;
  }

  // Agents
  async getAgents() {
    const resp = await this.client().get('/agents');
    return resp.data;
  }

  async createAgent(data) {
    const resp = await this.client().post('/agents', data);
    return resp.data;
  }

  async updateAgent(id, data) {
    const resp = await this.client().put(`/agents/${id}`, data);
    return resp.data;
  }

  async deleteAgent(id) {
    const resp = await this.client().delete(`/agents/${id}`);
    return resp.data;
  }

  // Groups — shared device scope per team
  async getGroups() {
    const resp = await this.client().get('/groups');
    return resp.data;
  }

  async createGroup(data) {
    const resp = await this.client().post('/groups', data);
    return resp.data;
  }

  async updateGroup(id, data) {
    const resp = await this.client().put(`/groups/${id}`, data);
    return resp.data;
  }

  async deleteGroup(id) {
    const resp = await this.client().delete(`/groups/${id}`);
    return resp.data;
  }

  // Conversations & Messages
  async getConversations(params = {}) {
    const resp = await this.client().get('/conversations', { params });
    return resp.data;
  }

  async startConversation(data) {
    const resp = await this.client().post('/conversations/new', data);
    return resp.data;
  }

  async getMessages(conversationId, params = {}) {
    const resp = await this.client().get(`/conversations/${conversationId}/messages`, { params });
    return resp.data;
  }

  async sendMessage(data) {
    const resp = await this.client().post('/messages/send', data);
    return resp.data;
  }

  async sendMedia(formData) {
    const resp = await this.client().post('/messages/send-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return resp.data;
  }

  async sendTyping(conversationId, state = 'composing') {
    const resp = await this.client().post('/messages/typing', {
      conversation_id: conversationId,
      state,
    });
    return resp.data;
  }

  async sendReaction(data) {
    const resp = await this.client().post('/messages/reaction', data);
    return resp.data;
  }

  async forwardMessage(data) {
    const resp = await this.client().post('/messages/forward', data);
    return resp.data;
  }

  async deleteMessage(data) {
    const resp = await this.client().post('/messages/delete', data);
    return resp.data;
  }

  async resolveConversation(id, rating = null, note = null) {
    const resp = await this.client().post(`/conversations/${id}/resolve`, { rating, note });
    return resp.data;
  }

  async assignConversation(id, agentId = null) {
    const resp = await this.client().post(`/conversations/${id}/assign`, { agent_id: agentId });
    return resp.data;
  }

  async renameConversation(id, name) {
    const resp = await this.client().put(`/conversations/${id}`, { name });
    return resp.data;
  }

  async getConversationMedia(id) {
    const resp = await this.client().get(`/conversations/${id}/media`);
    return resp.data;
  }

  // CRM Pricing & Plans
  async getPricingPlans() {
    const token = this.getToken();
    const resp = await axios.get(`${API_BASE}/crm/plans`, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return resp.data;
  }

  async calculateQuote(payload) {
    const resp = await axios.post(`${API_BASE}/crm/plans/calculate`, payload);
    return resp.data;
  }

  async subscribePlan(planSlug, paymentMethod = 'demo_checkout') {
    const resp = await this.client().post('/plans/subscribe', {
      plan_slug: planSlug,
      payment_method: paymentMethod,
    });
    return resp.data;
  }

  async purchaseAddon(addonType, quantity = 1, messageTier = 'tier_1k') {
    const resp = await this.client().post('/plans/addons/purchase', {
      addon_type: addonType,
      quantity,
      message_tier: messageTier,
    });
    return resp.data;
  }
}

export default new CrmService();
