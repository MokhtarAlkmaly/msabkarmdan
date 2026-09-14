ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS join_date_hijri text,
  ADD COLUMN IF NOT EXISTS prior_hifz numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS school_year text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS student_phone text,
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.student_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_statuses TO authenticated;
GRANT ALL ON public.student_statuses TO service_role;
ALTER TABLE public.student_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own statuses" ON public.student_statuses
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all statuses" ON public.student_statuses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_student_statuses_updated_at BEFORE UPDATE ON public.student_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.student_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  col_type text NOT NULL DEFAULT 'text',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_columns TO authenticated;
GRANT ALL ON public.student_columns TO service_role;
ALTER TABLE public.student_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own columns" ON public.student_columns
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all columns" ON public.student_columns
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_student_columns_updated_at BEFORE UPDATE ON public.student_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();