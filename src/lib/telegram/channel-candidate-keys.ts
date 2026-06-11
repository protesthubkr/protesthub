export function createTelegramSourceRecordId(
  channelUsername: string,
  messageId: number,
) {
  return `telegram:${channelUsername}:${messageId}`;
}

export function createTelegramMediaKey(
  channelUsername: string,
  messageId: number,
  index: number,
) {
  return `telegram:${channelUsername}:${messageId}:image:${index}`;
}
