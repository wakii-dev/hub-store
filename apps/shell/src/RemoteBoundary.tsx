import React, { Suspense } from "react";
import { Result, Spin } from "antd";
import { useTranslation } from "react-i18next";

/** Fallback khi remote không load được — KHÔNG BAO GIỜ trắng trang. */
function RemoteUnavailable() {
  const { t } = useTranslation("shell");
  return <Result status="warning" title={t("remote.unavailable")} />;
}

function RemoteLoading() {
  const { t } = useTranslation("shell");
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <Spin tip={t("remote.loading")} />
    </div>
  );
}

/**
 * Bọc MỌI remote mount: ErrorBoundary (catch lazy-load failure khi remote
 * chưa lên) + Suspense (catch lazy resolve). Dùng trong shell Routes.
 */
export default class RemoteBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <RemoteUnavailable />;
    return <Suspense fallback={<RemoteLoading />}>{this.props.children}</Suspense>;
  }
}
