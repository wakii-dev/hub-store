/**
 * Batching-service (Go, :50052) gRPC client — facade cho 8 RPC của
 * batching.proto. NOTE contract: CreateBatch/PackingSuggest/RecalculateDistance
 * nhận shop_code="" từ BFF — service PHẢI derive shop từ orders (hydration
 * GetOrdersByCodes → Java là source of truth, spec §3.3/§3.6).
 */
import { BatchingServiceClient } from '../../../../api/proto/gen/ts/hubstore/batching/v1/batching';
import type {
  CancelBatchRequest,
  CancelBatchResponse,
  CompletePickingRequest,
  CompletePickingResponse,
  CreateBatchRequest,
  CreateBatchResponse,
  FilterBatchesRequest,
  FilterBatchesResponse,
  GetBatchCriteriaRequest,
  GetBatchCriteriaResponse,
  GetBatchDetailRequest,
  GetBatchDetailResponse,
  PackingSuggestRequest,
  PackingSuggestResponse,
  RecalculateDistanceRequest,
  RecalculateDistanceResponse,
} from '../../../../api/proto/gen/ts/hubstore/batching/v1/batching';
import { callUnary, insecureChannel } from './grpc.js';

export interface BatchingApi {
  createBatch(req: CreateBatchRequest, role: string): Promise<CreateBatchResponse>;
  filterBatches(req: FilterBatchesRequest, role: string): Promise<FilterBatchesResponse>;
  getBatchDetail(req: GetBatchDetailRequest, role: string): Promise<GetBatchDetailResponse>;
  cancelBatch(req: CancelBatchRequest, role: string): Promise<CancelBatchResponse>;
  getBatchCriteria(req: GetBatchCriteriaRequest, role: string): Promise<GetBatchCriteriaResponse>;
  completePicking(req: CompletePickingRequest, role: string): Promise<CompletePickingResponse>;
  packingSuggest(req: PackingSuggestRequest, role: string): Promise<PackingSuggestResponse>;
  recalculateDistance(req: RecalculateDistanceRequest, role: string): Promise<RecalculateDistanceResponse>;
  close(): void;
}

export function createBatchingClient(addr: string, deadlineMs: number): BatchingApi {
  const c = new BatchingServiceClient(addr, insecureChannel());
  return {
    createBatch: (req, role) => callUnary(c.createBatch.bind(c), req, role, deadlineMs),
    filterBatches: (req, role) => callUnary(c.filterBatches.bind(c), req, role, deadlineMs),
    getBatchDetail: (req, role) => callUnary(c.getBatchDetail.bind(c), req, role, deadlineMs),
    cancelBatch: (req, role) => callUnary(c.cancelBatch.bind(c), req, role, deadlineMs),
    getBatchCriteria: (req, role) => callUnary(c.getBatchCriteria.bind(c), req, role, deadlineMs),
    completePicking: (req, role) => callUnary(c.completePicking.bind(c), req, role, deadlineMs),
    packingSuggest: (req, role) => callUnary(c.packingSuggest.bind(c), req, role, deadlineMs),
    recalculateDistance: (req, role) => callUnary(c.recalculateDistance.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}
