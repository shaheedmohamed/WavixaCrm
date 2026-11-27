/**
 * Notification → navigation bus.
 *
 * Push taps land in three different places (expo-notifications response
 * listener for OS-posted notifications, notifee events for app-rendered
 * ones, getLastNotificationResponseAsync for cold starts) but they all
 * mean the same thing: open conversation X. This module funnels them into
 * one queue the index screen drains once auth is ready.
 */
import { apiClient } from './api';

type OpenHandler = (conversationId: number) => void;

let handler: OpenHandler | null = null;
let pending: number[] = [];

/** Called by notification listeners — resolves + queues. */
export const requestOpenConversation = (conversationId: number | string | null | undefined) => {
  const id = Number(conversationId);
  if (!id || Number.isNaN(id)) return;
  if (handler) handler(id);
  else if (!pending.includes(id)) pending.push(id);
};

/** index.tsx registers the real navigation once mounted+authed. */
export const setOpenConversationHandler = (fn: OpenHandler | null) => {
  handler = fn;
  if (fn && pending.length) {
    const ids = [...pending];
    pending = [];
    // Latest tap wins — a queue of stale opens would walk the user
    // backwards through every chat they missed.
    fn(ids[ids.length - 1]!);
  }
};

/** Resolve a conversation id → full Conversation via the messages
 *  endpoint (returns the conversation snapshot alongside messages). */
export const fetchConversationById = async (conversationId: number) => {
  const res = await apiClient.get(`/crm/conversations/${conversationId}/messages`, {
    params: { limit: 1, peek: true },
  });
  return res.data?.conversation ?? null;
};
