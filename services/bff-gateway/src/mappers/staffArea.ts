/**
 * Mappers StaffAreaService proto → REST DTO (SF-17). DTO giữ camelCase trùng
 * tên proto (contract mới, không có §4 legacy) — chỉ bỏ undefined → JSON gọn.
 */
import type { ServiceEmployee, VerifyPaymentAccountResponse as ProtoVerifyResult } from '../../../../api/proto/gen/ts/hubstore/staffarea/v1/staffarea';

export interface ServiceEmployeeDto {
  employeeCode: string;
  fullName: string;
  titleCode: string;
  paymentAccount: string;
  isActive: boolean;
  regionCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VerifyPaymentAccountDto {
  valid: boolean;
  source: string;
  message: string;
}

export function mapServiceEmployee(e: ServiceEmployee): ServiceEmployeeDto {
  return {
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    titleCode: e.titleCode,
    paymentAccount: e.paymentAccount,
    isActive: e.isActive,
    regionCodes: e.regionCodes ?? [],
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function mapVerifyResult(r: ProtoVerifyResult): VerifyPaymentAccountDto {
  return { valid: r.valid, source: r.source, message: r.message };
}
