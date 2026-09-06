-- Profile images are account data. Keep the bucket private and owner-readable.

UPDATE storage.buckets
SET public = false
WHERE id = 'profile-avatars';

DROP POLICY IF EXISTS "Profile avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile avatars" ON storage.objects;

CREATE POLICY "Users can view their own profile avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
