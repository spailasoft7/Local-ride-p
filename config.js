// Paste your own values from Supabase: Project Settings > API
const SUPABASE_URL = "https://gkjuuxecuvzqxcwbqfbt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OVunMiRmWtol0ouXyIa3Og_eUNnXeIJ";

// How often the driver sends location (milliseconds) and how old a location can be
// before the passenger app stops showing that taxi (seconds).
const SEND_EVERY_MS = 10000;
const STALE_AFTER_SECONDS = 35;
