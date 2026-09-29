// Helpers to save / load a user's own data.
// You never pass user_id: the database fills it with auth.uid() and
// Row Level Security makes sure each user only ever sees his own rows.
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type DocType =
  | "resume"
  | "cover_letter"
  | "application"
  | "interview_prep"
  | "setting";

export type UserDocument<T = Record<string, unknown>> = {
  id: string;
  user_id: string;
  type: DocType;
  title: string | null;
  content: T;
  created_at: string;
  updated_at: string;
};

/** Create a new item, or update it if you pass an id. */
export async function saveDocument<T extends Record<string, unknown>>(
  type: DocType,
  content: T,
  opts: { id?: string; title?: string } = {}
) {
  if (opts.id) {
    return supabase
      .from("user_documents")
      .update({ content, title: opts.title, updated_at: new Date().toISOString() })
      .eq("id", opts.id)
      .select()
      .single<UserDocument<T>>();
  }
  return supabase
    .from("user_documents")
    .insert({ type, content, title: opts.title ?? null })
    .select()
    .single<UserDocument<T>>();
}

/** Get all items of one type for the logged-in user (newest first). */
export async function getDocuments<T = Record<string, unknown>>(type: DocType) {
  return supabase
    .from("user_documents")
    .select("*")
    .eq("type", type)
    .order("created_at", { ascending: false })
    .returns<UserDocument<T>[]>();
}

export async function deleteDocument(id: string) {
  return supabase.from("user_documents").delete().eq("id", id);
}

/** Update fields on the logged-in user's profile. */
export async function updateProfile(
  userId: string,
  fields: Partial<{ first_name: string; last_name: string; language: string; cv_path: string }>
) {
  return supabase
    .from("profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
}