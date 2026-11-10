-- Owners can sign in with Google (Neon Auth). A signed-in user owns at most one kitchen.
alter table subscribers add column user_id text unique;
alter table subscribers add column email text;
