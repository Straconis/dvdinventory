-- Two confirmed Best Buy product image URLs serve generic placeholders.
-- Clear only these URLs so existing missing-cover counts and scans include them.
begin;
update public.physical_releases
set cover_image_url = null
where cover_image_url ~* '/BestBuy_US/images/products/(9862/9862358_sa|2053/20538121)\.jpg([?#]|$)';
commit;
