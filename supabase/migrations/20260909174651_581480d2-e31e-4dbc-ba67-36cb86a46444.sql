CREATE TABLE public.monthly_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  year text NOT NULL,
  month integer NOT NULL,
  memorization_from_surah integer,
  memorization_from_ayah integer,
  memorization_to_surah integer,
  memorization_to_ayah integer,
  memorization_hifz_score numeric NOT NULL DEFAULT 0,
  memorization_recitation_score numeric NOT NULL DEFAULT 0,
  review_from_surah integer,
  review_from_ayah integer,
  review_to_surah integer,
  review_to_ayah integer,
  review_hifz_score numeric NOT NULL DEFAULT 0,
  review_recitation_score numeric NOT NULL DEFAULT 0,
  attendance_score numeric NOT NULL DEFAULT 0,
  behavior_score numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (student_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_tracking TO authenticated;
GRANT ALL ON public.monthly_tracking TO service_role;

ALTER TABLE public.monthly_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monthly_tracking" ON public.monthly_tracking
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own monthly_tracking" ON public.monthly_tracking
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own monthly_tracking" ON public.monthly_tracking
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own monthly_tracking" ON public.monthly_tracking
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all monthly_tracking" ON public.monthly_tracking
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_monthly_tracking_updated_at
  BEFORE UPDATE ON public.monthly_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_monthly_tracking_lookup ON public.monthly_tracking (user_id, year, month);