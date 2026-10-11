import { env } from "./env";

type Button = { text: string; callback_data?: string; url?: string };
export type Keyboard = Button[][];

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

export const chatId = () => env("TELEGRAM_CHAT_ID");

export async function sendMessage(text: string, keyboard?: Keyboard, replyTo?: number) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId(),
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
  });
}

export async function editMessage(messageId: number, text: string, keyboard?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId(),
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard ?? [] },
  }).catch((e) => {
    if (!String(e.message).includes("message is not modified")) throw e;
  });
}

export const answerCallback = (id: string, text?: string) =>
  call("answerCallbackQuery", { callback_query_id: id, text }).catch(() => undefined);

export const setWebhook = (url: string, secret: string) =>
  call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });

export const getWebhookInfo = () => call("getWebhookInfo", {});
