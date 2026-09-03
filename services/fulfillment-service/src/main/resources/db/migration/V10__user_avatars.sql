-- SF-21 (FI-266) — user avatars (spec §4 D3): BFF ghi/đọc trực tiếp qua pg Pool.
CREATE TABLE user_avatars (
  user_id varchar PRIMARY KEY,
  content_type varchar NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
