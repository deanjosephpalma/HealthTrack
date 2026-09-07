-- Heat map clinical source: doctor-completed consults with a diagnosis only.
-- Reported Cases stay in estimated_cases (separate UI source).
-- Apply after phase3_performance.sql / earlier heatmap RPC.

create or replace function public.heatmap_pila_disease_counts(
  p_disease text default null,
  p_barangay text default null
)
returns table (
  barangay text,
  disease text,
  count bigint,
  lat double precision,
  lng double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    nullif(trim(pr.barangay), '')::text as barangay,
    nullif(trim(pr.diagnosis), '')::text as disease,
    count(*)::bigint as count,
    avg(pr.latitude)::double precision as lat,
    avg(pr.longitude)::double precision as lng
  from public.patient_records pr
  where pr.archived_at is null
    and pr.doctor_completed_at is not null
    and nullif(trim(pr.barangay), '') is not null
    and nullif(trim(pr.diagnosis), '') is not null
    -- Exclude non-disease / admin outcomes
    and coalesce(pr.notes, '') not ilike 'Nurse desk outcome:%'
    and lower(trim(pr.diagnosis)) not in ('essentially normal (000)', 'essentially normal', '000')
    and not (
      coalesce(pr.medcert_pwd, false)
      or coalesce(pr.medcert_work, false)
      or coalesce(pr.medcert_financial, false)
      or coalesce(pr.medcert_4ps, false)
      or coalesce(pr.medcert_school, false)
      or nullif(trim(coalesce(pr.medcert_others, '')), '') is not null
    )
    and (
      pr.municipality is null
      or lower(trim(pr.municipality)) in ('pila', 'n/a', '')
      or pr.municipality ilike 'pila%'
    )
    and (
      p_disease is null
      or trim(p_disease) = ''
      or pr.diagnosis ilike ('%' || trim(p_disease) || '%')
    )
    and (
      p_barangay is null
      or trim(p_barangay) = ''
      or pr.barangay ilike ('%' || trim(p_barangay) || '%')
    )
  group by 1, 2
  order by count desc;
$$;

revoke all on function public.heatmap_pila_disease_counts(text, text) from public;
grant execute on function public.heatmap_pila_disease_counts(text, text) to authenticated;
grant execute on function public.heatmap_pila_disease_counts(text, text) to service_role;
