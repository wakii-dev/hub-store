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
import { callUnary, insecureChannel, SERVICE_NAMES, type Caller } from './grpc.js';

export interface StaffAreaApi {
  listServiceEmployees(
    req: ListServiceEmployeesRequest,
    caller: Caller,
  ): Promise<ListServiceEmployeesResponse>;
  getServiceEmployee(req: GetServiceEmployeeRequest, caller: Caller): Promise<GetServiceEmployeeResponse>;
  createServiceEmployee(
    req: CreateServiceEmployeeRequest,
    caller: Caller,
  ): Promise<CreateServiceEmployeeResponse>;
  updateServiceEmployee(
    req: UpdateServiceEmployeeRequest,
    caller: Caller,
  ): Promise<UpdateServiceEmployeeResponse>;
  setServiceEmployeeActive(
    req: SetServiceEmployeeActiveRequest,
    caller: Caller,
  ): Promise<SetServiceEmployeeActiveResponse>;
  verifyPaymentAccount(
    req: VerifyPaymentAccountRequest,
    caller: Caller,
  ): Promise<VerifyPaymentAccountResponse>;
  close(): void;
}

export function createStaffAreaClient(addr: string, deadlineMs: number): StaffAreaApi {
  const c = new StaffAreaServiceClient(addr, insecureChannel());
  return {
    listServiceEmployees: (req, caller) => callUnary(c.listServiceEmployees.bind(c), req, caller, deadlineMs),
    getServiceEmployee: (req, caller) => callUnary(c.getServiceEmployee.bind(c), req, caller, deadlineMs),
    createServiceEmployee: (req, caller) => callUnary(c.createServiceEmployee.bind(c), req, caller, deadlineMs),
    updateServiceEmployee: (req, caller) => callUnary(c.updateServiceEmployee.bind(c), req, caller, deadlineMs),
    setServiceEmployeeActive: (req, caller) =>
      callUnary(c.setServiceEmployeeActive.bind(c), req, caller, deadlineMs),
    verifyPaymentAccount: (req, caller) => callUnary(c.verifyPaymentAccount.bind(c), req, caller, deadlineMs),
    close: () => c.close(),
  };
}

export { SERVICE_NAMES };
