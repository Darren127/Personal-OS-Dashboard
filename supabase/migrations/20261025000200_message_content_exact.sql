-- Store message content exactly as sent. `jsonb` reorders object keys, which
-- would change the replayed history; the API ties the model's reasoning (and
-- the prompt cache) to the exact history, so use `json`, which keeps the
-- original text.
alter table public.conversation_messages
  alter column content drop default,
  alter column content type json using content::json,
  alter column content set default '[]'::json;
