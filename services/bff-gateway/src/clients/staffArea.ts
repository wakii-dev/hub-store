/**
 * StaffAreaService (Java, :50051 — cùng process fulfillment-service, SF-17)
 * gRPC client — facade cho 6 RPC mà REST /service-employees/* surface dùng.
 * Pattern y hệt fulfillment.ts: ts-proto grpc-js stub + callUnary (x-user-role
 * metadata tự mang theo).
 */
import { StaffAreaServiceClient } from '../../../../api/proto/gen/ts/hubstore/staffarea/v1/staffarea';
import type {
  CreateServiceEmployeeRequest,
  CreateServiceEmployeeResponse,
  GetServiceEmployeeRequest,
  GetServiceEmployeeResponse,
  ListServiceEmployeesRequest,
  ListServiceEmployeesResponse,
  SetServiceEmployeeActiveRequest,
  SetServiceEmployeeActiveResponse,
  UpdateServiceEmployeeRequest,
  UpdateServiceEmployeeResponse,
  VerifyPaymentAccountRequest,
  VerifyPaymentAccountResponse,
} from '../../../../api/proto/gen/ts/hubstore/staffarea/v1/staffarea';
import { callUnary, insecureChannel, SERVICE_NAMES } from './grpc.js';

export interface StaffAreaApi {
  listServiceEmployees(
    req: ListServiceEmployeesRequest,
    role: string,
  ): Promise<ListServiceEmployeesResponse>;
  getServiceEmployee(req: GetServiceEmployeeRequest, role: string): Promise<GetServiceEmployeeResponse>;
  createServiceEmployee(
    req: CreateServiceEmployeeRequest,
    role: string,
  ): Promise<CreateServiceEmployeeResponse>;
  updateServiceEmployee(
    req: UpdateServiceEmployeeRequest,
    role: string,
  ): Promise<UpdateServiceEmployeeResponse>;
  setServiceEmployeeActive(
    req: SetServiceEmployeeActiveRequest,
    role: string,
  ): Promise<SetServiceEmployeeActiveResponse>;
  verifyPaymentAccount(
    req: VerifyPaymentAccountRequest,
    role: string,
  ): Promise<VerifyPaymentAccountResponse>;
  close(): void;
}

export function createStaffAreaClient(addr: string, deadlineMs: number): StaffAreaApi {
  const c = new StaffAreaServiceClient(addr, insecureChannel());
  return {
    listServiceEmployees: (req, role) => callUnary(c.listServiceEmployees.bind(c), req, role, deadlineMs),
    getServiceEmployee: (req, role) => callUnary(c.getServiceEmployee.bind(c), req, role, deadlineMs),
    createServiceEmployee: (req, role) => callUnary(c.createServiceEmployee.bind(c), req, role, deadlineMs),
    updateServiceEmployee: (req, role) => callUnary(c.updateServiceEmployee.bind(c), req, role, deadlineMs),
    setServiceEmployeeActive: (req, role) =>
      callUnary(c.setServiceEmployeeActive.bind(c), req, role, deadlineMs),
    verifyPaymentAccount: (req, role) => callUnary(c.verifyPaymentAccount.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}

export { SERVICE_NAMES };
