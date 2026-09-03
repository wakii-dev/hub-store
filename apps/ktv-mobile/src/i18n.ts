import type { I18nResources } from "@hub-store/shared";

/**
 * ktvMobile namespace — VI gốc (SF-22 convention: không hardcode string trong
 * component) + EN. Tự init ở standalone boot qua main.tsx (app không qua MF).
 */
export const ktvMobileResources: I18nResources = {
  vi: {
    ktvMobile: {
      "app.title": "HubStore KTV",
      "nav.orders": "Đơn của tôi",
      "nav.account": "Tài khoản",
      "myorders.title": "Đơn của tôi",
      "myorders.greeting": "Xin chào, {{name}}",
      "myorders.placeholder": "Danh sách đơn hôm nay sẽ hiển thị ở đây.",
      "account.title": "Tài khoản",
      "account.username": "Tài khoản",
      "account.name": "Họ tên",
      "account.role": "Vai trò",
      "account.logout": "Đăng xuất",
      "role.InsideTechnician": "KTV lắp đặt",
      "role.OutsideTechnician": "CTV giao hàng",
      "forbidden.title": "Không có quyền truy cập",
      "forbidden.sub": "Tài khoản này không có vai trò KTV/CTV trên hệ thống.",
      "auth.loading": "Đang kiểm tra phiên đăng nhập…",
      "auth.callback.loading": "Đang hoàn tất đăng nhập…",
      "auth.callback.error": "Đăng nhập thất bại — thử lại.",
    },
  },
  en: {
    ktvMobile: {
      "app.title": "HubStore KTV",
      "nav.orders": "My orders",
      "nav.account": "Account",
      "myorders.title": "My orders",
      "myorders.greeting": "Hello, {{name}}",
      "myorders.placeholder": "Today's orders will appear here.",
      "account.title": "Account",
      "account.username": "Username",
      "account.name": "Name",
      "account.role": "Role",
      "account.logout": "Sign out",
      "role.InsideTechnician": "Installation technician",
      "role.OutsideTechnician": "Delivery technician",
      "forbidden.title": "Access denied",
      "forbidden.sub": "This account has no technician role on the system.",
      "auth.loading": "Checking session…",
      "auth.callback.loading": "Finishing sign-in…",
      "auth.callback.error": "Sign-in failed — please retry.",
    },
  },
};
