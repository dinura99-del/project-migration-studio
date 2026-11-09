-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.content (
  id integer NOT NULL DEFAULT nextval('content_id_seq'::regclass),
  type USER-DEFINED NOT NULL DEFAULT 'movie'::enum_content_type,
  title character varying NOT NULL,
  slug character varying NOT NULL,
  tmdb_id numeric NOT NULL,
  overview character varying,
  manual_description character varying,
  poster_url character varying,
  backdrop_url character varying,
  thumbnail_url character varying,
  logo_url character varying,
  video_link character varying,
  embed_link character varying,
  mp4_link character varying,
  dailymotion_link character varying,
  trailer_url character varying,
  youtube_trailer_key character varying,
  sinhala_subtitle_url character varying,
  subtitle_credit_url character varying,
  language character varying,
  release_year numeric,
  year numeric,
  runtime numeric,
  rating numeric,
  vote_count numeric,
  imdb_id character varying,
  tagline character varying,
  featured boolean DEFAULT false,
  is_adult boolean DEFAULT false,
  status USER-DEFINED NOT NULL DEFAULT 'published'::enum_content_status,
  source character varying DEFAULT 'hf_pipeline'::character varying,
  telegram_file_id character varying,
  studio_id integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  published_at timestamp with time zone DEFAULT now(),
  seasons jsonb,
  episodes_dirty boolean DEFAULT false,
  subtitle_automation_status text NOT NULL DEFAULT 'pending'::text,
  subtitle_automation_attempts integer NOT NULL DEFAULT 0,
  subtitle_automation_last_attempt_at timestamp with time zone,
  subtitle_automation_error text,
  subtitle_automation_source text,
  CONSTRAINT content_pkey PRIMARY KEY (id),
  CONSTRAINT content_studio_id_studios_id_fk FOREIGN KEY (studio_id) REFERENCES public.studios(id)
);
CREATE TABLE public.content_rels (
  id integer NOT NULL DEFAULT nextval('content_rels_id_seq'::regclass),
  order integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  genres_id integer,
  CONSTRAINT content_rels_pkey PRIMARY KEY (id),
  CONSTRAINT content_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.content(id),
  CONSTRAINT content_rels_genres_fk FOREIGN KEY (genres_id) REFERENCES public.genres(id)
);
CREATE TABLE public.episodes (
  id integer NOT NULL DEFAULT nextval('episodes_id_seq'::regclass),
  content_id integer NOT NULL,
  season numeric NOT NULL,
  episode numeric NOT NULL,
  title character varying,
  video_link character varying,
  embed_link character varying,
  mp4_link character varying,
  dailymotion_link character varying,
  sinhala_subtitle_url character varying,
  subtitle_credit_url character varying,
  season_poster_url character varying,
  season_year numeric,
  is_public boolean DEFAULT true,
  status USER-DEFINED NOT NULL DEFAULT 'published'::enum_episodes_status,
  telegram_file_id character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  subtitle_automation_status text NOT NULL DEFAULT 'pending'::text,
  subtitle_automation_attempts integer NOT NULL DEFAULT 0,
  subtitle_automation_last_attempt_at timestamp with time zone,
  subtitle_automation_error text,
  subtitle_automation_source text,
  CONSTRAINT episodes_pkey PRIMARY KEY (id),
  CONSTRAINT episodes_content_id_content_id_fk FOREIGN KEY (content_id) REFERENCES public.content(id)
);
CREATE TABLE public.genres (
  id integer NOT NULL DEFAULT nextval('genres_id_seq'::regclass),
  name character varying NOT NULL,
  slug character varying NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT genres_pkey PRIMARY KEY (id)
);
CREATE TABLE public.studios_tmdb_company_ids (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id numeric NOT NULL,
  CONSTRAINT studios_tmdb_company_ids_pkey PRIMARY KEY (id),
  CONSTRAINT studios_tmdb_company_ids_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.studios(id)
);
CREATE TABLE public.studios_aliases (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying NOT NULL,
  alias character varying,
  CONSTRAINT studios_aliases_pkey PRIMARY KEY (id),
  CONSTRAINT studios_aliases_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.studios(id)
);
CREATE TABLE public.studios (
  id integer NOT NULL DEFAULT nextval('studios_id_seq'::regclass),
  name character varying NOT NULL,
  slug character varying NOT NULL,
  logo_url character varying,
  sort_order numeric DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT studios_pkey PRIMARY KEY (id)
);
CREATE TABLE public.collections (
  id integer NOT NULL DEFAULT nextval('collections_id_seq'::regclass),
  name character varying NOT NULL,
  slug character varying NOT NULL,
  description character varying,
  poster_url character varying,
  backdrop_url character varying,
  is_public boolean DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collections_pkey PRIMARY KEY (id)
);
CREATE TABLE public.collections_rels (
  id integer NOT NULL DEFAULT nextval('collections_rels_id_seq'::regclass),
  order integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  content_id integer,
  CONSTRAINT collections_rels_pkey PRIMARY KEY (id),
  CONSTRAINT collections_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.collections(id),
  CONSTRAINT collections_rels_content_fk FOREIGN KEY (content_id) REFERENCES public.content(id)
);
CREATE TABLE public.requests (
  id integer NOT NULL DEFAULT nextval('requests_id_seq'::regclass),
  email character varying NOT NULL,
  tmdb_id numeric NOT NULL,
  title character varying NOT NULL,
  type USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::enum_requests_status,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT requests_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users_sessions (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying NOT NULL,
  created_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT users_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT users_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  full_name character varying,
  role USER-DEFINED NOT NULL DEFAULT 'moderator'::enum_users_role,
  avatar_url character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email character varying NOT NULL,
  reset_password_token character varying,
  reset_password_expiration timestamp with time zone,
  salt character varying,
  hash character varying,
  reset_password_requested_at timestamp with time zone,
  login_attempts numeric DEFAULT 0,
  lock_until timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.video_reports (
  id integer NOT NULL DEFAULT nextval('video_reports_id_seq'::regclass),
  content_id integer NOT NULL,
  content_type USER-DEFINED NOT NULL,
  episode_id integer,
  issue_type character varying NOT NULL,
  message character varying,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::enum_video_reports_status,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT video_reports_pkey PRIMARY KEY (id),
  CONSTRAINT video_reports_content_id_content_id_fk FOREIGN KEY (content_id) REFERENCES public.content(id),
  CONSTRAINT video_reports_episode_id_episodes_id_fk FOREIGN KEY (episode_id) REFERENCES public.episodes(id)
);
CREATE TABLE public.payload_kv (
  id integer NOT NULL DEFAULT nextval('payload_kv_id_seq'::regclass),
  key character varying NOT NULL,
  data jsonb NOT NULL,
  CONSTRAINT payload_kv_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payload_locked_documents (
  id integer NOT NULL DEFAULT nextval('payload_locked_documents_id_seq'::regclass),
  global_slug character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payload_locked_documents_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payload_locked_documents_rels (
  id integer NOT NULL DEFAULT nextval('payload_locked_documents_rels_id_seq'::regclass),
  order integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  content_id integer,
  episodes_id integer,
  genres_id integer,
  studios_id integer,
  collections_id integer,
  requests_id integer,
  users_id integer,
  video_reports_id integer,
  CONSTRAINT payload_locked_documents_rels_pkey PRIMARY KEY (id),
  CONSTRAINT payload_locked_documents_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_locked_documents(id),
  CONSTRAINT payload_locked_documents_rels_content_fk FOREIGN KEY (content_id) REFERENCES public.content(id),
  CONSTRAINT payload_locked_documents_rels_episodes_fk FOREIGN KEY (episodes_id) REFERENCES public.episodes(id),
  CONSTRAINT payload_locked_documents_rels_genres_fk FOREIGN KEY (genres_id) REFERENCES public.genres(id),
  CONSTRAINT payload_locked_documents_rels_studios_fk FOREIGN KEY (studios_id) REFERENCES public.studios(id),
  CONSTRAINT payload_locked_documents_rels_collections_fk FOREIGN KEY (collections_id) REFERENCES public.collections(id),
  CONSTRAINT payload_locked_documents_rels_requests_fk FOREIGN KEY (requests_id) REFERENCES public.requests(id),
  CONSTRAINT payload_locked_documents_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id),
  CONSTRAINT payload_locked_documents_rels_video_reports_fk FOREIGN KEY (video_reports_id) REFERENCES public.video_reports(id)
);
CREATE TABLE public.payload_preferences (
  id integer NOT NULL DEFAULT nextval('payload_preferences_id_seq'::regclass),
  key character varying,
  value jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payload_preferences_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payload_preferences_rels (
  id integer NOT NULL DEFAULT nextval('payload_preferences_rels_id_seq'::regclass),
  order integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  users_id integer,
  CONSTRAINT payload_preferences_rels_pkey PRIMARY KEY (id),
  CONSTRAINT payload_preferences_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_preferences(id),
  CONSTRAINT payload_preferences_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id)
);
CREATE TABLE public.payload_migrations (
  id integer NOT NULL DEFAULT nextval('payload_migrations_id_seq'::regclass),
  name character varying,
  batch numeric,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payload_migrations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.top_ten (
  id integer NOT NULL DEFAULT nextval('top_ten_id_seq'::regclass),
  updated_at timestamp with time zone,
  created_at timestamp with time zone,
  CONSTRAINT top_ten_pkey PRIMARY KEY (id)
);
CREATE TABLE public.top_ten_rels (
  id integer NOT NULL DEFAULT nextval('top_ten_rels_id_seq'::regclass),
  order integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  content_id integer,
  CONSTRAINT top_ten_rels_pkey PRIMARY KEY (id),
  CONSTRAINT top_ten_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.top_ten(id),
  CONSTRAINT top_ten_rels_content_fk FOREIGN KEY (content_id) REFERENCES public.content(id)
);
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.onflix_cache_version (
  id smallint NOT NULL CHECK (id = 1),
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT onflix_cache_version_pkey PRIMARY KEY (id)
);
CREATE TABLE public.onflix_revalidation_outbox (
  event_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'delivered'::text])),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT onflix_revalidation_outbox_pkey PRIMARY KEY (event_id)
);
CREATE TABLE public.subtitle_automation_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subtitle_automation_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.subtitle_automation_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text])),
  title text NOT NULL,
  season_number integer NOT NULL DEFAULT 0,
  episode_number integer NOT NULL DEFAULT 0,
  release_date date,
  popularity numeric,
  runtime integer,
  poster_path text,
  status text NOT NULL DEFAULT 'upcoming'::text CHECK (status = ANY (ARRAY['upcoming'::text, 'waiting_embed'::text, 'waiting_subtitle'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamp with time zone,
  error_log text,
  srt_path text,
  srt_url text,
  srt_preview text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subtitle_automation_jobs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content_id bigint NOT NULL,
  content_type text NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous'::text,
  author_avatar text,
  text text NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  parent_id uuid,
  is_verified boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id)
);