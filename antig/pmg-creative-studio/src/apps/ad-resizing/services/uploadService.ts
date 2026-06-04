import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import { newId } from '../../../utils/ids';
import { fileTypeFromMime, extFromMime } from '../utils/uploadValidation';
import type { Creative } from '../types';

export interface UploadMeta {
  name: string;
  url: string;
  fileType: 'PNG' | 'JPG' | 'WEBP';
  width: number;
  height: number;
  sizeBytes: number;
  uploadedBy: string;
}

function uploadsCol(clientSlug: string) {
  return collection(db, 'clients', clientSlug, 'apps', 'ad-resizing', 'uploads');
}

export function docToCreative(d: Record<string, unknown> & { uploadedAt: Timestamp }): Creative {
  const rawType = d.fileType as string;
  const fileType: 'PNG' | 'JPG' | 'WEBP' =
    rawType === 'PNG' ? 'PNG'
    : rawType === 'WEBP' ? 'WEBP'
    : 'JPG';

  return {
    id: d.id as string,
    name: d.name as string,
    thumbnailUrl: d.url as string,
    originalUrl: d.url as string,
    width: d.width as number,
    height: d.height as number,
    fileType,
    uploadedAt: d.uploadedAt.toDate().toISOString(),
    source: 'upload',
    sourceKind: 'upload',
    tags: [],
  };
}

export async function uploadCreative(
  clientSlug: string,
  file: File,
  dimensions: { width: number; height: number },
): Promise<Creative> {
  const uploadId = newId();
  const ext = extFromMime(file.type);
  const storagePath = paths.storage.app(clientSlug, 'ad-resizing', `uploads/${uploadId}.${ext}`);
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const meta: UploadMeta = {
    name: file.name,
    url,
    fileType: fileTypeFromMime(file.type),
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: file.size,
    uploadedBy: auth.currentUser?.uid ?? '',
  };

  const docRef = doc(uploadsCol(clientSlug), uploadId);
  await setDoc(docRef, { id: uploadId, ...meta, uploadedAt: serverTimestamp() });

  return {
    id: uploadId,
    name: file.name,
    thumbnailUrl: url,
    originalUrl: url,
    width: dimensions.width,
    height: dimensions.height,
    fileType: meta.fileType,
    // Uses client clock — avoids an extra doc read; acceptable drift for display purposes.
    uploadedAt: new Date().toISOString(),
    source: 'upload',
    sourceKind: 'upload',
    tags: [],
  };
}

export async function listUploads(clientSlug: string, uid: string): Promise<Creative[]> {
  const q = query(
    uploadsCol(clientSlug),
    where('uploadedBy', '==', uid),
    orderBy('uploadedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d =>
    docToCreative(d.data() as Record<string, unknown> & { uploadedAt: Timestamp }),
  );
}

export async function retryFirestoreWrite(
  clientSlug: string,
  uploadId: string,
  meta: UploadMeta,
): Promise<void> {
  const docRef = doc(uploadsCol(clientSlug), uploadId);
  await setDoc(docRef, { id: uploadId, ...meta, uploadedAt: serverTimestamp() });
}
