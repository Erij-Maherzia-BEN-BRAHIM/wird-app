-- Members of the group (PINs are chosen by each girl on first login).
insert into public.members (handle) values
  ('sarah_rh__'), ('amalbachraoui'), ('meriem_ben_brahimm'), ('ikram_attouchi'),
  ('chediabenmansour'), ('mahabenmansour_'), ('ayah__diary'), ('mayssa.bch'),
  ('soumayazaalouni'), ('mariahvsj474'), ('erij_benbrahim'), ('aya_khadhraoui'),
  ('elaac_herif'), ('safa.mejri26'), ('malak_ben_mansour')
on conflict (handle) do nothing;

-- Day 1 (2026-10-06): Meriem already finished in the group list.
insert into public.checkins (member_id, day, status)
select id, '2026-10-06', 1 from public.members where handle = 'meriem_ben_brahimm'
on conflict do nothing;
