import type { I18nResources } from "@hub-store/shared";

/** Ngôn ngữ shell persist ở localStorage (VI↔EN toggle ở header). */
export const LANG_STORAGE_KEY = "hub-store.lang";

/** Shell-owned translations — namespace `shell.*`. Remotes tự đăng ký ns của mình. */
export const shellResources: I18nResources = {
  vi: {
    shell: {
      "header.title": "Hub Store",
      "nav.orders": "Đơn hàng",
      "nav.batch": "Phiếu soạn",
      "nav.print": "In phiếu",
      "remote.unavailable":
        "Remote không khả dụng — vui lòng kiểm tra remote service đã chạy và thử lại.",
      "remote.loading": "Đang tải module…",
      "notfound.title": "Không tìm thấy trang",
      "forbidden.title": "Không có quyền truy cập",
      "forbidden.subtitle": "Vai trò hiện tại không được phép xem màn hình này.",
      "auth.login.title": "Đăng nhập Hub Store",
      "auth.login.subtitle":
        "Dev stub — chọn vai trò để trải nghiệm. Production dùng OIDC SSO.",
      "auth.login.username": "Tên người dùng",
      "auth.login.role": "Vai trò",
      "auth.login.button": "Đăng nhập",
      "auth.logout": "Đăng xuất",
      "auth.role.Coordinator": "Điều phối",
      "auth.role.WarehouseOps": "Vận hành kho",
      "auth.role.Manager": "Quản lý",
    },
  },
  en: {
    shell: {
      "header.title": "Hub Store",
      "nav.orders": "Orders",
      "nav.batch": "Picking batches",
      "nav.print": "Print documents",
      "remote.unavailable":
        "Remote unavailable — please check that the remote service is running and try again.",
      "remote.loading": "Loading module…",
      "notfound.title": "Page not found",
      "forbidden.title": "Access denied",
      "forbidden.subtitle": "Your current role is not allowed to view this screen.",
      "auth.login.title": "Sign in to Hub Store",
      "auth.login.subtitle":
        "Dev stub — pick a role to explore. Production uses OIDC SSO.",
      "auth.login.username": "Username",
      "auth.login.role": "Role",
      "auth.login.button": "Sign in",
      "auth.logout": "Sign out",
      "auth.role.Coordinator": "Coordinator",
      "auth.role.WarehouseOps": "Warehouse Ops",
      "auth.role.Manager": "Manager",
    },
  },
};
