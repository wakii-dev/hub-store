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
import { callUnary, insecureChannel, type Caller } from './grpc.js';

export interface BatchingApi {
  createBatch(req: CreateBatchRequest, caller: Caller): Promise<CreateBatchResponse>;
  filterBatches(req: FilterBatchesRequest, caller: Caller): Promise<FilterBatchesResponse>;
  getBatchDetail(req: GetBatchDetailRequest, caller: Caller): Promise<GetBatchDetailResponse>;
  cancelBatch(req: CancelBatchRequest, caller: Caller): Promise<CancelBatchResponse>;
  getBatchCriteria(req: GetBatchCriteriaRequest, caller: Caller): Promise<GetBatchCriteriaResponse>;
  completePicking(req: CompletePickingRequest, caller: Caller): Promise<CompletePickingResponse>;
  packingSuggest(req: PackingSuggestRequest, caller: Caller): Promise<PackingSuggestResponse>;
  recalculateDistance(req: RecalculateDistanceRequest, caller: Caller): Promise<RecalculateDistanceResponse>;
  close(): void;
}

export function createBatchingClient(addr: string, deadlineMs: number): BatchingApi {
  const c = new BatchingServiceClient(addr, insecureChannel());
  return {
    createBatch: (req, caller) => callUnary(c.createBatch.bind(c), req, caller, deadlineMs),
    filterBatches: (req, caller) => callUnary(c.filterBatches.bind(c), req, caller, deadlineMs),
    getBatchDetail: (req, caller) => callUnary(c.getBatchDetail.bind(c), req, caller, deadlineMs),
    cancelBatch: (req, caller) => callUnary(c.cancelBatch.bind(c), req, caller, deadlineMs),
    getBatchCriteria: (req, caller) => callUnary(c.getBatchCriteria.bind(c), req, caller, deadlineMs),
    completePicking: (req, caller) => callUnary(c.completePicking.bind(c), req, caller, deadlineMs),
    packingSuggest: (req, caller) => callUnary(c.packingSuggest.bind(c), req, caller, deadlineMs),
    recalculateDistance: (req, caller) => callUnary(c.recalculateDistance.bind(c), req, caller, deadlineMs),
    close: () => c.close(),
  };
}
