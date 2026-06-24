/**
 * User-scoped image gallery for the template builder canvas layer.
 *
 * Storage path:  clients/{slug}/apps/template-builder/uploads/{uid}/{uploadId}.{ext}
 * Firestore:     clients/{slug}/apps/template-builder/uploads/{uploadId}
 *                — filtered by uploadedBy == auth.currentUser.uid
 *
 * Security: Firestore rules should restrict reads to documents where
 *   resource.data.uploadedBy == request.auth.uid (user-gated).
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import { newId } from '../../../utils/ids';

export interface UserCanvasAsset {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

function uploadsCol(clientSlug: string) {
  return collection(db, 'clients', clientSlug, 'apps', 'template-builder', 'uploads');
}

/**
 * Upload an image file and write metadata to Firestore.
 * @param clientSlug  The client context (from useParams :clientSlug)
 * @param file        The image File from an <input type="file">
 * @param onProgress  Optional callback with 0-100 progress value
 */
export async function uploadUserCanvasImage(
  clientSlug: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UserCanvasAsset> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated — cannot upload');

  const uploadId = newId();
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const storagePath = paths.storage.app(
    clientSlug as Parameters<typeof paths.storage.app>[0],
    'template-builder' as Parameters<typeof paths.storage.app>[1],
    `uploads/${uid}/${uploadId}.${ext}`,
  );
  const storageRef = ref(storage, storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      reject,
      () => resolve(),
    );
  });

  const url = await getDownloadURL(storageRef);

  const asset: Omit<UserCanvasAsset, 'uploadedAt'> & { uploadedAt: ReturnType<typeof serverTimestamp> } = {
    id: uploadId,
    name: file.name,
    url,
    sizeBytes: file.size,
    uploadedBy: uid,
    uploadedAt: serverTimestamp(),
  };

  await setDoc(doc(uploadsCol(clientSlug), uploadId), asset);

  return { ...asset, uploadedAt: new Date().toISOString() };
}

/**
 * Fetch all images uploaded by the current user for this client.
 * Returns newest-first.
 */
export async function listUserCanvasImages(
  clientSlug: string,
): Promise<UserCanvasAsset[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(uploadsCol(clientSlug), where('uploadedBy', '==', uid));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const uploadedAt = (data.uploadedAt as Timestamp | null)?.toDate().toISOString()
        ?? new Date().toISOString();
      return { ...(data as Omit<UserCanvasAsset, 'uploadedAt'>), uploadedAt };
    })
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}
