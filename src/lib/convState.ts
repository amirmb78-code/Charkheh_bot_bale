import { db } from "@/db";
import { conversationStates } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface ConversationState {
  chatId: string;
  state: string;
  requestId: number | null;
  data: Record<string, unknown> | null;
}

export async function getConversationState(chatId: string): Promise<ConversationState | null> {
  const rows = await db
    .select()
    .from(conversationStates)
    .where(eq(conversationStates.chatId, chatId));
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    chatId: row.chatId,
    state: row.state,
    requestId: row.requestId ?? null,
    data: (row.data as Record<string, unknown> | null) ?? null,
  };
}

export async function setConversationState(
  chatId: string,
  state: string,
  requestId?: number | null,
  data?: Record<string, unknown> | null,
): Promise<void> {
  await db
    .insert(conversationStates)
    .values({
      chatId,
      state,
      requestId: requestId ?? null,
      data: data ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: conversationStates.chatId,
      set: { state, requestId: requestId ?? null, data: data ?? null, updatedAt: new Date() },
    });
}

export async function clearConversationState(chatId: string): Promise<void> {
  await db.delete(conversationStates).where(eq(conversationStates.chatId, chatId));
}
