/**
 * SF-21 avatar (spec §4 D3): upload input → native canvas square center crop
 * (drawImage → toBlob jpeg) → POST multipart /avatar. KHÔNG thêm dependency.
 * Display: GET /avatar/<userId> fetch-as-blob với auth header (axios singleton
 * của @hub-store/api-client — Bearer tự gắn như mọi BFF call khác), 404/error
 * → fallback initials. Cache-buster `?v=<version>` sau upload để tránh
 * Cache-Control max-age=300 phục vụ ảnh cũ.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getAxiosInstance } from '@hub-store/api-client';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png'] as const;

/** Client-side pre-check — server vẫn validate lại (magic bytes + size). */
export function validateAvatarFile(file: File): string | null {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) {
    return 'Chỉ chấp nhận ảnh JPEG hoặc PNG.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Ảnh phải nhỏ hơn 5MB.';
  }
  return null;
}

/** Crop vuông giữa (cover) — canvas native, output đúng size side×side. */
export function squareCenterCrop(img: HTMLImageElement, side = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const crop = Math.min(w, h);
  const sx = (w - crop) / 2;
  const sy = (h - crop) / 2;
  ctx.drawImage(img, sx, sy, crop, crop, 0, 0, side, side);
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh.'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được blob ảnh.'))),
      'image/jpeg',
      0.9,
    );
  });
}

/** File → load → crop vuông giữa → JPEG blob (gửi qua multipart). */
export async function fileToJpegBlob(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    return await canvasToBlob(squareCenterCrop(img));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** POST /avatar multipart — trả updatedAt từ BFF (dùng làm cache-buster). */
export async function uploadAvatar(file: File): Promise<string | null> {
  const blob = await fileToJpegBlob(file);
  const form = new FormData();
  form.append('file', blob, 'avatar.jpg');
  const res = await getAxiosInstance().post<{ updatedAt: string | null }>('/avatar', form);
  return res.data.updatedAt ?? null;
}

/** GET /avatar/<userId> as blob → object URL; 404/error → null (fallback). */
export function useAvatarUrl(userId: string, version: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    getAxiosInstance()
      .get<Blob>(`/avatar/${encodeURIComponent(userId)}`, {
        params: { v: version },
        responseType: 'blob',
      })
      .then((res) => {
        if (cancelled || typeof URL.createObjectURL !== 'function') return;
        revoked = URL.createObjectURL(res.data);
        setUrl(revoked);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (revoked !== null && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(revoked);
      }
    };
  }, [userId, version]);
  return url;
}

/**
 * Avatar chip + upload trigger: click → file input → validate → crop → POST →
 * bump version (cache-buster) → ảnh mới hiện NGAY (không cần reload — E2E T12
 * vẫn assert "sau reload" qua đường cache riêng). Fallback = initials khi
 * chưa có/404. KHÔNG đụng testid có sẵn (header-user… nằm ngoài component).
 */
export function AvatarUpload(props: {
  userId: string;
  fallback: ReactNode;
  size?: number;
  title?: string;
}) {
  const [version, setVersion] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const url = useAvatarUrl(props.userId, version);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input để chọn lại cùng file vẫn fire change.
      e.target.value = '';
      if (!file) return;
      const invalid = validateAvatarFile(file);
      if (invalid) {
        setError(invalid);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await uploadAvatar(file);
        setVersion(Date.now());
      } catch {
        setError('Không tải được ảnh lên. Thử lại sau.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return (
    <label
      style={{
        display: 'inline-flex',
        cursor: busy ? 'wait' : 'pointer',
        position: 'relative',
        flexShrink: 0,
      }}
      title={props.title ?? 'Cập nhật ảnh đại diện'}
      data-testid="avatar-upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={onChange}
        data-testid="avatar-input"
      />
      {url !== null ? (
        <img
          src={url}
          alt=""
          width={props.size ?? 28}
          height={props.size ?? 28}
          style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          data-testid="avatar-image"
        />
      ) : (
        props.fallback
      )}
      {error !== null && (
        <span
          role="alert"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            fontSize: 11,
            color: '#cf1322',
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </span>
      )}
    </label>
  );
}
