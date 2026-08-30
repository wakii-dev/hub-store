// Type declarations cho các module federation — exposes contract ĐÃ PIN (spec §2.7).
// Đổi tên module ở đây = đổi exposes ở remote = DAG gãy.
declare module "orders/D1Page" {
  import type { ComponentType } from "react";
  const D1Page: ComponentType;
  export default D1Page;
}

declare module "fulfillment/BatchListPage" {
  import type { ComponentType } from "react";
  const BatchListPage: ComponentType;
  export default BatchListPage;
}

declare module "fulfillment/PrintPage" {
  import type { ComponentType } from "react";
  const PrintPage: ComponentType;
  export default PrintPage;
}
