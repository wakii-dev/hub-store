# SF-6 Context Pack — Shell app (MF host)
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §2). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 1 (dep SF-1). Chạy SONG SONG với SF-2 — bạn KHÔNG cần BFF để hoàn thành (auth là stub).

## Spec slice (SF-6 chịu trách nhiệm)
1. **MF host theo SPIKE 1 verdict** (SF-1): cấu hình shell load 2 remotes từ `remotes.config.json` (pre-seed SF-1); dynamic remote loading + **fallback message khi remote chưa lên** (không trắng trang). KHÔNG sửa exposes contract table.
2. **AppLayout** (tokens §7): sidebar 48px + header 55px, FPT orange #EB6E09, Roboto; AntD ConfigProvider wrap VÙNG MOUNT REMOTE (chỉ hiệu lực khi antd singleton — đã pin SF-1).
3. **Router**: `/hub-store-order/order` → orders/D1Page; `/hub-store-order/batch` → fulfillment/BatchListPage; `/hub-store-order/batch/print` → fulfillment/PrintPage. Shell owns BrowserRouter (RRD singleton — `useNavigate` trong remote hoạt động). 404 page.
4. **Auth stub**: login giả lập → sinh fake JWT HS256 (`jose`, `JWT_DEV_SECRET` từ root `.env`, payload `{sub, role}`) · **role switcher** UI (Coordinator / Warehouse Ops / Manager) · OIDC config qua env vars (`VITE_OIDC_AUTHORITY`...) — production chỉ đổi env.
5. **setTokenGetter registration**: shell đăng ký token-getter vào api-client singleton lúc init (context KHÔNG xuyên MF boundary).
6. **i18next init**: 1 instance; namespaces `shell.*` + wire `orders.*`/`fulfillment.*` (remotes đăng ký sau); VI/EN toggle (VI ngôn ngữ gốc).
7. **Route gating theo role matrix §2**: Coordinator → thấy D1+D2+Print; WarehouseOps → D2+Print; Manager → tất cả. Gate ở tầng shell route mount.
8. Smoke test: shell load 2 remote skeletons qua federation.

## Touch map (SF-6 sở hữu)
```
apps/shell/**            (ngoài skeleton SF-1 — bạn sở hữu phần thân)
```
READ-ONLY: remotes.config.json (chỉ thêm READER — entries do SF-7/SF-9 điền), packages/shared/**, packages/api-client/**, apps/orders|fulfillment/**, services/**, api/**.

## ACCEPTANCE (user-visible)
- Shell :3000: login stub → vào layout; role switcher đổi routes nhìn thấy được (Coordinator thấy menu D1, Ops không).
- VI↔EN toggle đổi nhãn layout (sidebar/header).
- 2 remotes skeletons load vào mount region; tắt 1 remote → fallback message.
- Fake JWT sinh được (decode thấy role); api-client nhận token qua setTokenGetter.

## Boundary (KHÔNG làm)
- KHÔNG business screen nào (SF-7..10); KHÔNG sửa skeleton federation config SF-1 (trừ đọc remotes.config).
- KHÔNG gọi BFF thật (SF-2 song song — auth stub tự contain).
- KHÔNG đụng apps/orders|fulfillment nội dung (SF-7/9).
