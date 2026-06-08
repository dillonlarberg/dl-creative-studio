import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import { newId } from '../../../utils/ids';

export async function uploadVideo(
  clientSlug: string,
  file: File,
): Promise<{ storagePath: string; url: string; name: string }> {
  const id = newId();
  const storagePath = paths.storage.app(clientSlug, 'video-cutdown', `uploads/${id}.mp4`);
  const r = ref(storage, storagePath);
  await uploadBytes(r, file);
  return { storagePath, url: await getDownloadURL(r), name: file.name };
}
