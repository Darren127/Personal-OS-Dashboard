-- Explicit, strictly increasing order for conversation messages. Several
-- messages can be stored in the same instant, so created_at alone can't be
-- trusted to replay a conversation in the exact order it was sent.
alter table public.conversation_messages
  add column seq bigint generated always as identity;

create index conversation_messages_seq_idx
  on public.conversation_messages (conversation_id, seq);
