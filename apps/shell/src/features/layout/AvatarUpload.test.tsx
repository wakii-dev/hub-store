/**
 * SF-21 — AvatarUpload tests: client validate (type/size), crop pipeline
 * (canvas mocked — jsdom không có 2D context), POST multipart + cache-buster
 * refetch, fallback initials khi GET 404. axios singleton được mock toàn bộ.
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AvatarUpload,
  validateAvatarFile,
  fileToJpegBlob,
} from './AvatarUpload';

const { axiosMock } = vi.hoisted(() => ({
  axiosMock: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@hub-store/api-client', () => ({
  getAxiosInstance: () => axiosMock,
}));

beforeEach(() => {
  axiosMock.get.mockReset();
  axiosMock.post.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateAvatarFile', () => {
  it('chỉ nhận jpeg/png; >5MB bị chặn', () => {
    expect(validateAvatarFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(validateAvatarFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull();
    expect(validateAvatarFile(new File(['x'], 'a.gif', { type: 'image/gif' }))).toMatch(/JPEG|PNG/);
    const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    expect(validateAvatarFile(big)).toMatch(/5MB/);
  });
});

describe('fileToJpegBlob (canvas native crop)', () => {
  it('crop vuông giữa → toBlob jpeg', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-src'),
      revokeObjectURL: vi.fn(),
    });
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 50;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (cb: BlobCallback) => cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
    );
    const blob = await fileToJpegBlob(new File(['fake'], 'a.png', { type: 'image/png' }));
    expect(blob.type).toBe('image/jpeg');
    // crop rect = min(w,h) vuông giữa: sx=0? w=100 h=50 → sx=25, sy=0
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 25, 0, 50, 50, 0, 0, 128, 128);
  });
});

describe('AvatarUpload component', () => {
  it('GET 404 → fallback initials; có label + input file', async () => {
    axiosMock.get.mockRejectedValue({ response: { status: 404 } });
    render(
      <AvatarUpload
        userId="tester"
        fallback={<span data-testid="avatar-fallback">TE</span>}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('avatar-fallback')).toBeTruthy());
    expect(screen.queryByTestId('avatar-image')).toBeNull();
    expect(screen.getByTestId('avatar-upload')).toBeTruthy();
    expect(screen.getByTestId('avatar-input')).toBeTruthy();
    // Đúng gọi GET /avatar/tester với cache-buster param.
    expect(axiosMock.get).toHaveBeenCalledWith('/avatar/tester', expect.objectContaining({ responseType: 'blob' }));
  });

  it('GET 200 blob → hiện img object URL', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-1'),
      revokeObjectURL: vi.fn(),
    });
    axiosMock.get.mockResolvedValue({ data: new Blob(['x'], { type: 'image/png' }) });
    render(<AvatarUpload userId="tester" fallback={<span>TE</span>} />);
    await waitFor(() => expect(screen.getByTestId('avatar-image')).toBeTruthy());
    expect(screen.getByTestId('avatar-image').getAttribute('src')).toBe('blob:mock-1');
  });

  it('chọn file hợp lệ → crop → POST /avatar FormData → refetch với version mới', async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 40;
      naturalHeight = 40;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-src'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (cb: BlobCallback) => cb(new Blob([new Uint8Array([9])], { type: 'image/jpeg' })),
    );
    axiosMock.get.mockRejectedValue({ response: { status: 404 } });
    axiosMock.post.mockResolvedValue({ data: { updatedAt: '2026-09-03T01:02:03.000Z' } });

    render(<AvatarUpload userId="tester" fallback={<span>TE</span>} />);
    const input = screen.getByTestId('avatar-input') as HTMLInputElement;
    const file = new File(['fake-image-bytes'], 'me.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(axiosMock.post).toHaveBeenCalledTimes(1));
    expect(axiosMock.post).toHaveBeenCalledWith('/avatar', expect.any(FormData));
    const form = axiosMock.post.mock.calls[0][1] as FormData;
    expect(form.get('file')).toBeInstanceOf(Blob);
    // Sau upload thành công → refetch với cache-buster version mới (2 lần GET).
    await waitFor(() => expect(axiosMock.get).toHaveBeenCalledTimes(2));
    const secondParams = axiosMock.get.mock.calls[1][1] as { params: { v: number } };
    expect(typeof secondParams.params.v).toBe('number');
  });

  it('chọn file sai loại → hiện lỗi, KHÔNG POST', async () => {
    axiosMock.get.mockRejectedValue({ response: { status: 404 } });
    render(<AvatarUpload userId="tester" fallback={<span>TE</span>} />);
    const input = screen.getByTestId('avatar-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/JPEG|PNG/));
    expect(axiosMock.post).not.toHaveBeenCalled();
  });
});
