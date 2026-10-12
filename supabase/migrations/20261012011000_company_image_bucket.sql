-- Keep uploaded company-information images private in the existing record-scoped bucket.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'dbd-documents';
